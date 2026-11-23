<script setup lang="ts">
import ConsoleDataTable from '#qiandao-console/ConsoleDataTable.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleListPagination from '~/components/console/ConsoleListPagination.vue'
import ConsoleSettingsField from '~/components/console/ConsoleSettingsField.vue'
import ConsoleDialog from '~/components/material/ConsoleDialog.vue'
import { adminUserDefaultPageSize, adminUserPageSizes, attendeePasswordMin, attendeePasswordMax, type AdminUserPage, type AdminUserRow, type ContactKind } from '#shared/attendee-account'
import { displayDate } from '#shared/models'
import { brand } from '#shared/brand'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '用户列表' })

const { data, error: initialError } = await useFetch<AdminUserPage>('/api/manage/users', {
  key: 'admin-users',
  cache: 'no-store',
})
const result = ref(data.value)
const searchText = ref('')
const appliedSearch = ref('')
const error = ref(initialError.value ? errorText(initialError.value, '暂时无法加载用户列表') : '')
const pending = ref<'search' | 'reset' | 'previous' | 'next' | 'size' | 'background'>()
const paging = computed(() => pending.value === 'previous' || pending.value === 'next' || pending.value === 'size' ? pending.value : undefined)
const page = computed(() => result.value?.page ?? 1)
const pageSize = computed(() => result.value?.pageSize ?? adminUserDefaultPageSize)
const pages = computed(() => Math.max(1, Math.ceil((result.value?.total ?? 0) / pageSize.value)))
const sizeOptions = adminUserPageSizes.map(size => ({ label: size + ' 条/页', value: size }))
const canReset = computed(() => Boolean(searchText.value || appliedSearch.value || page.value > 1))
const emptyTitle = computed(() => !result.value
  ? pending.value ? '正在加载用户列表…' : '列表暂不可用'
  : appliedSearch.value ? '没有匹配的用户' : '暂无注册用户')
const kinds = { phone: '手机号', email: '邮箱', wechat: '微信' }
const columns = [
  { id: 'sequence', header: '序号' },
  { accessorKey: 'avatarUrl', header: '头像' },
  { accessorKey: 'displayName', header: '名称' },
  { accessorKey: 'phone', header: '手机号' },
  { accessorKey: 'createdAt', header: '注册时间' },
  { id: 'actions', header: '操作' },
]

async function load(action: NonNullable<typeof pending.value>, term: string, nextPage = 1, nextPageSize = pageSize.value) {
  if (pending.value) return
  pending.value = action
  error.value = ''
  try {
    result.value = await manageRequest<AdminUserPage>('users', { query: { q: term || undefined, page: nextPage, pageSize: nextPageSize } })
    appliedSearch.value = term
  } catch (cause) {
    error.value = errorText(cause, '暂时无法加载用户列表')
  } finally {
    pending.value = undefined
  }
}

function reset() {
  if (pending.value) return
  searchText.value = ''
  void load('reset', '')
}

function setPageSize(size: number) {
  if (size !== pageSize.value) void load('size', appliedSearch.value, 1, size)
}

const kindOptions: { label: string, value: ContactKind }[] = [
  { label: '手机号', value: 'phone' },
  { label: '邮箱', value: 'email' },
]
const savingUser = ref(false)
const avatarBusy = ref(false)
const createOpen = ref(false)
const createError = ref('')
const editingUser = ref<AdminUserRow>()
const avatarChanged = ref(false)
const initialUser = { kind: 'phone' as ContactKind, identifier: '', password: '', displayName: '', phone: '', avatarMaterialId: null as string | null }
const newUser = reactive({ ...initialUser })
const toast = useToast()
const formKind = computed(() => editingUser.value?.kind ?? newUser.kind)
const rowAction = ref<{ user: AdminUserRow, action: 'status' | 'delete' }>()
const actionOpen = ref(false)
const actionBusy = ref(false)
const actionError = ref('')
const actionTitle = computed(() => rowAction.value?.action === 'delete'
  ? '删除用户' : rowAction.value?.user.disabled ? '启用用户' : '停用用户')
const actionDescription = computed(() => {
  if (rowAction.value?.action === 'delete') return '删除后账号无法登录，已有活动报名和签到记录保留。'
  return rowAction.value?.user.disabled ? '启用后此用户可重新登录。' : '停用后现有登录会失效，用户暂时无法登录。'
})
const userTitle = (user: AdminUserRow) => user.displayName || user.phone || user.label

function openCreate() {
  editingUser.value = undefined
  avatarChanged.value = false
  Object.assign(newUser, initialUser)
  createError.value = ''
  createOpen.value = true
}

function openEdit(id: unknown) {
  const user = result.value?.rows.find(row => row.id === id)
  if (!user || pending.value) return
  editingUser.value = user
  avatarChanged.value = false
  Object.assign(newUser, {
    identifier: user.kind === 'wechat' ? '' : user.label, password: '',
    displayName: user.displayName, phone: user.phone ?? '', avatarMaterialId: null,
  })
  createError.value = ''
  createOpen.value = true
}

function chooseAvatar(id: string | null) {
  newUser.avatarMaterialId = id
  avatarChanged.value = true
}

watch(createOpen, open => { if (!open) newUser.password = '' })
watch(() => newUser.kind, () => {
  if (!editingUser.value) newUser.identifier = newUser.phone = ''
})

async function saveUser() {
  if (savingUser.value || avatarBusy.value) return
  savingUser.value = true
  createError.value = ''
  const edited = editingUser.value
  try {
    if (edited) {
      await manageRequest('edit-user', {
        method: 'POST',
        body: {
          id: edited.id, displayName: newUser.displayName, phone: newUser.phone,
          ...(avatarChanged.value ? { avatarMaterialId: newUser.avatarMaterialId } : {}),
          ...(newUser.password ? { password: newUser.password } : {}),
        },
      })
    } else {
      await manageRequest('users', { method: 'POST', body: { ...newUser } })
      searchText.value = ''
    }
    createOpen.value = false
    toast.add({ title: edited ? '用户资料已保存' : '用户已新增', color: 'success' })
    void load('background', edited ? appliedSearch.value : '', edited ? page.value : 1)
  } catch (cause) {
    createError.value = errorText(cause, edited ? '保存用户失败' : '新增用户失败')
  } finally {
    savingUser.value = false
  }
}

function askAction(id: unknown, action: 'status' | 'delete') {
  const user = result.value?.rows.find(row => row.id === id)
  if (!user || pending.value) return
  rowAction.value = { user, action }
  actionError.value = ''
  actionOpen.value = true
}

async function confirmAction() {
  const target = rowAction.value
  if (!target || actionBusy.value) return
  actionBusy.value = true
  actionError.value = ''
  try {
    const deleting = target.action === 'delete'
    await manageRequest(deleting ? 'delete-user' : 'set-user-status', {
      method: 'POST', body: deleting ? { id: target.user.id } : { id: target.user.id, disabled: !target.user.disabled },
    })
    toast.add({ title: deleting ? '用户已删除' : target.user.disabled ? '用户已启用' : '用户已停用', color: 'success' })
    actionOpen.value = false
    void load('background', appliedSearch.value, page.value)
  } catch (cause) {
    actionError.value = errorText(cause)
  } finally {
    actionBusy.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <section class="panel list-panel" aria-labelledby="users-heading">
      <header class="panel-toolbar list-heading">
        <h1 id="users-heading" class="page-title">用户列表</h1>
        <UButton type="button" icon="i-lucide-user-plus" :disabled="!!pending" @click="openCreate">新增用户</UButton>
      </header>
      <form class="panel-toolbar list-filters" @submit.prevent="load('search', searchText.trim())">
        <UInput v-model="searchText" class="list-search" maxlength="254"
          aria-label="搜索用户" placeholder="名称、手机号或邮箱" :readonly="!!pending" />
        <div class="toolbar-actions">
          <UButton type="submit" icon="i-lucide-search" :loading="pending === 'search'" :disabled="!!pending">搜索</UButton>
          <UButton type="button" variant="outline" color="neutral" icon="i-lucide-rotate-ccw" :loading="pending === 'reset'" :disabled="!!pending || !canReset"
            @click="reset">重置</UButton>
        </div>
      </form>
      <p v-if="error" class="feedback error panel-message" role="alert">{{ error }}</p>
      <div class="table-scroll list-table" :aria-busy="!!pending">
        <ConsoleDataTable :data="result?.rows ?? []" :columns="columns" :show-sequence="false" :client-pagination="false" :empty-title="emptyTitle">
          <template #sequence-cell="{ row }">{{ (page - 1) * pageSize + row.index + 1 }}</template>
          <template #avatarUrl-cell="{ row }">
            <span class="user-avatar">
              <img :src="String(row.original.avatarUrl || brand.defaultAvatar)" alt="" width="34" height="34" loading="lazy" />
            </span>
          </template>
          <template #displayName-cell="{ row }">
            <strong>{{ row.original.displayName || (row.original.kind === 'wechat' ? '微信用户' : '未设置') }}</strong>
            <UBadge v-if="row.original.disabled" color="neutral" variant="soft" class="ms-1.5">已停用</UBadge>
            <small v-if="row.original.kind === 'email'" class="user-email">{{ row.original.label }}</small>
          </template>
          <template #phone-cell="{ row }">{{ row.original.phone || '未填写' }}</template>
          <template #createdAt-cell="{ row }">
            <time :datetime="String(row.original.createdAt)">{{ displayDate(String(row.original.createdAt)) }}</time>
          </template>
          <template #actions-cell="{ row }">
            <div class="user-row-actions">
              <UButton type="button" size="sm" variant="ghost" :disabled="!!pending" @click="openEdit(row.original.id)">编辑</UButton>
              <UButton type="button" size="sm" variant="ghost" color="neutral" :disabled="!!pending"
                @click="askAction(row.original.id, 'status')">{{ row.original.disabled ? '启用' : '停用' }}</UButton>
              <UButton type="button" size="sm" variant="ghost" color="error" :disabled="!!pending"
                @click="askAction(row.original.id, 'delete')">删除</UButton>
            </div>
          </template>
        </ConsoleDataTable>
      </div>
      <ConsoleListPagination label="用户列表" :count="result ? '共 ' + result.total + ' 位用户' : '暂无统计'"
        :page="page" :pages="pages" :page-size="pageSize" :size-options="sizeOptions" :pending="paging"
        :disabled="!result || !!pending" @resize="setPageSize"
        @turn="load($event, appliedSearch, page + ($event === 'next' ? 1 : -1))" />
    </section>
    <ConsoleDialog v-model:open="createOpen" :title="editingUser ? '编辑用户' : '新增用户'"
      :dismissible="!savingUser && !avatarBusy" :close="!savingUser && !avatarBusy">
      <template #body>
        <form id="create-user-form" class="form-stack create-user-form" @submit.prevent="saveUser">
          <ConsoleSettingsField label="账号类型">
            <span v-if="editingUser" class="user-fixed-field">{{ kinds[editingUser.kind] }}</span>
            <AdminSelect v-else v-model="newUser.kind" :items="kindOptions" size="md" :disabled="savingUser" aria-label="账号类型" />
          </ConsoleSettingsField>
          <ConsoleSettingsField v-if="formKind !== 'wechat'" :label="kinds[formKind]" input-id="new-user-identifier" :required="!editingUser">
            <ConsoleInput id="new-user-identifier" v-model.trim="newUser.identifier" variant="none"
              :type="formKind === 'phone' ? 'tel' : 'email'" :maxlength="formKind === 'phone' ? 16 : 254"
              autocomplete="off" :required="!editingUser" :readonly="savingUser || !!editingUser" />
          </ConsoleSettingsField>
          <ConsoleSettingsField v-if="formKind !== 'phone'" label="手机号" input-id="new-user-phone">
            <ConsoleInput id="new-user-phone" v-model.trim="newUser.phone" variant="none" type="tel" maxlength="16"
              autocomplete="off" :readonly="savingUser" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="名称" input-id="new-user-name" required>
            <ConsoleInput id="new-user-name" v-model.trim="newUser.displayName" variant="none" maxlength="60"
              autocomplete="off" required :readonly="savingUser" />
          </ConsoleSettingsField>
          <ConsoleSettingsField v-if="formKind !== 'wechat'" :label="editingUser ? '新密码' : '初始密码'" input-id="new-user-password" :required="!editingUser">
            <ConsoleInput id="new-user-password" v-model="newUser.password" variant="none" type="password" autocomplete="new-password"
              :minlength="attendeePasswordMin" :maxlength="attendeePasswordMax"
              :placeholder="editingUser ? '填写后重设密码' : '至少 ' + attendeePasswordMin + ' 个字符'"
              :required="!editingUser" :readonly="savingUser" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="头像">
            <MaterialPicker :key="editingUser?.id ?? 'new'" :model-value="newUser.avatarMaterialId" :current-url="editingUser?.avatarUrl ?? undefined"
              label="头像" shape="square" hide-label :disabled="savingUser" @update:model-value="chooseAvatar" @busy="avatarBusy = $event" />
          </ConsoleSettingsField>
          <p v-if="createError" class="feedback error" role="alert">{{ createError }}</p>
        </form>
      </template>
      <template #footer>
        <ConsoleFormActions>
          <UButton type="button" color="neutral" variant="outline" :disabled="savingUser || avatarBusy" @click="createOpen = false">取消</UButton>
          <UButton type="submit" form="create-user-form" :disabled="avatarBusy" :loading="savingUser">{{ editingUser ? '保存修改' : '创建用户' }}</UButton>
        </ConsoleFormActions>
      </template>
    </ConsoleDialog>
    <ConsoleDialog v-model:open="actionOpen" :title="actionTitle" :dismissible="!actionBusy" :close="!actionBusy">
      <template #body>
        <p v-if="rowAction">「{{ userTitle(rowAction.user) }}」{{ actionDescription }}</p>
        <p v-if="actionError" class="feedback error mt-3" role="alert">{{ actionError }}</p>
      </template>
      <template #footer>
        <ConsoleFormActions>
          <UButton type="button" color="neutral" variant="outline" :disabled="actionBusy" @click="actionOpen = false">取消</UButton>
          <UButton type="button" :color="rowAction?.action === 'delete' ? 'error' : 'primary'"
            :loading="actionBusy" @click="confirmAction">{{ actionTitle }}</UButton>
        </ConsoleFormActions>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.table-scroll :deep(table) { width: 100%; min-width: 46rem; table-layout: fixed; }
.table-scroll :deep(th:first-child) { width: 5rem; }
.table-scroll :deep(th:nth-child(2)) { width: 6rem; }
.table-scroll :deep(th:nth-child(4)) { width: 9rem; }
.table-scroll :deep(th:nth-child(5)) { width: 12rem; }
.table-scroll :deep(th:last-child) { width: 13rem; }
.table-scroll :deep(td:nth-child(3)) { white-space: normal; overflow-wrap: anywhere; }
.table-scroll :deep(time) { white-space: nowrap; font-variant-numeric: tabular-nums; }
.user-avatar { display: grid; place-items: center; width: 34px; height: 34px; overflow: hidden; border-radius: 50%; background: #e9f0fb; color: #4165a6; font-size: 17px; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-email { display: block; margin-top: 2px; color: var(--muted); }
.user-row-actions { display: flex; flex-wrap: wrap; gap: 3px; }
.user-fixed-field { display: flex; align-items: center; min-height: var(--qm-admin-control-height); font-size: 14px; }
.create-user-form { --settings-label-width: 6.5rem; --settings-content-width: 21rem; gap: 13px; }
.create-user-form :deep(.image-select-tile) { width: 76px; height: 76px; }
</style>
