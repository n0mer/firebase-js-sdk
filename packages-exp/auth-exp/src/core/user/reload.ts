/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { User } from '@firebase/auth-types-exp';

import {
  getAccountInfo,
  ProviderUserInfo
} from '../../api/account_management/account';
import { UserInfoInternal, UserInternal } from '../../model/user';
import { ProviderId } from '../providers';
import { assert } from '../util/assert';
import { castInternal } from '../util/cast_internal';

export async function _reloadWithoutSaving(user: UserInternal): Promise<void> {
  const auth = user.auth;
  const idToken = await user.getIdToken();
  const response = await getAccountInfo(auth, { idToken });

  assert(response?.users.length, auth.name);

  const coreAccount = response.users[0];
  const newProviderData = coreAccount.providerUserInfo?.length
    ? extractProviderData(coreAccount.providerUserInfo, auth.name)
    : [];
  const updates: Partial<UserInternal> = {
    uid: coreAccount.localId,
    displayName: coreAccount.displayName || null,
    photoURL: coreAccount.photoUrl || null,
    email: coreAccount.email || null,
    emailVerified: coreAccount.emailVerified || false,
    phoneNumber: coreAccount.phoneNumber || null,
    tenantId: coreAccount.tenantId || null,
    providerData: mergeProviderData(user.providerData, newProviderData),
    metadata: {
      creationTime: coreAccount.createdAt?.toString(),
      lastSignInTime: coreAccount.lastLoginAt?.toString()
    }
  };

  Object.assign(user, updates);
}

export async function reload(user: User): Promise<void> {
  const userInternal: UserInternal = castInternal(user);
  await _reloadWithoutSaving(userInternal);

  // Even though the current user hasn't changed, update
  // current user will trigger a persistence update w/ the
  // new info.
  return userInternal.auth.updateCurrentUser(userInternal);
}

function mergeProviderData(
  original: UserInfoInternal[],
  newData: UserInfoInternal[]
): UserInfoInternal[] {
  const deduped = original.filter(
    o => !newData.some(n => n.providerId === o.providerId)
  );
  return [...deduped, ...newData];
}

function extractProviderData(
  providers: ProviderUserInfo[],
  appName: string
): UserInfoInternal[] {
  return providers.map(({ providerId, ...provider }) => {
    assert(
      providerId && Object.values<string>(ProviderId).includes(providerId),
      appName
    );
    return {
      uid: provider.rawId || '',
      displayName: provider.displayName || null,
      email: provider.email || null,
      phoneNumber: provider.phoneNumber || null,
      providerId: providerId as ProviderId,
      photoURL: provider.photoUrl || null
    };
  });
}