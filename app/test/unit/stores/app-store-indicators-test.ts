import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import { CloningRepository } from '../../../src/models/cloning-repository'
import { Repository } from '../../../src/models/repository'

describe('AppStore repository indicators', () => {
  let appStore: AppStore

  after(() => {
    mock.restoreAll()
  })

  before(async () => {
    mock.module('../../../src/ui/main-process-proxy', {
      namedExports: {
        ...(await import('../../../src/ui/main-process-proxy')),
        getAppMenu: () => {},
      },
    })
    const { AppStore } = await import('../../../src/lib/stores/app-store')
    const { AliveStore } = await import('../../../src/lib/stores/alive-store')
    const { NotificationsStore } = await import(
      '../../../src/lib/stores/notifications-store'
    )
    const { PullRequestCoordinator } = await import(
      '../../../src/lib/stores/pull-request-coordinator'
    )
    const { createTestStores } = await import(
      '../../helpers/app-store-test-harness'
    )
    const { StatsStore } = await import('../../../src/lib/stats')
    mock.method(window, 'setTimeout', () => 0)
    mock.method(window, 'addEventListener', () => {})

    const stores = createTestStores()
    const statsStore = new StatsStore()
    const pullRequestCoordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    const notificationsStore = new NotificationsStore(
      stores.accountsStore,
      new AliveStore(stores.accountsStore),
      pullRequestCoordinator,
      statsStore
    )
    appStore = new AppStore(
      stores.gitHubUserStore,
      stores.cloningRepositoriesStore,
      stores.issuesStore,
      statsStore,
      stores.signInStore,
      stores.accountsStore,
      stores.repositoriesStore,
      pullRequestCoordinator,
      stores.repositoryStateCache,
      stores.apiRepositoriesStore,
      notificationsStore
    )
  })

  it('excludes the selected repository when its instance has changed', () => {
    const repository = new Repository('/repositories/selected', 1, null, false)
    const updatedRepository = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'Updated alias'
    )
    const otherRepository = new Repository(
      '/repositories/other',
      2,
      null,
      false
    )
    appStore['repositories'] = [updatedRepository, otherRepository]
    appStore['selectedRepository'] = repository

    assert.notStrictEqual(repository, updatedRepository)
    assert.notStrictEqual(repository.hash, updatedRepository.hash)
    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      [otherRepository]
    )
  })

  it('excludes the selected repository when its instance is unchanged', () => {
    const repository = new Repository('/repositories/selected', 1, null, false)
    appStore['repositories'] = [repository]
    appStore['selectedRepository'] = repository

    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      []
    )
  })

  it('returns a copy of all repositories when none is selected', () => {
    const repositories = [
      new Repository('/repositories/first', 1, null, false),
      new Repository('/repositories/second', 2, null, false),
    ]
    appStore['repositories'] = repositories
    appStore['selectedRepository'] = null

    const result = appStore['repositoryIndicatorUpdater']['getRepositories']()

    assert.deepStrictEqual(result, repositories)
    assert.notStrictEqual(result, repositories)
  })

  it('keeps local repositories when a cloning repository is selected', () => {
    const selectedRepository = new CloningRepository(
      '/repositories/cloning',
      'https://github.com/desktop/cloning.git'
    )
    const repositories = [
      new Repository('/repositories/local', selectedRepository.id, null, false),
    ]
    appStore['repositories'] = repositories
    appStore['selectedRepository'] = selectedRepository

    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      repositories
    )
  })
})
