import { ErrorSanitizer } from "./ErrorSanitizer";
import { SqliteDatabase } from "./SqliteDatabase";
import { ApiUsageRepository } from "./repositories/ApiUsageRepository";
import { AppStateRepository } from "./repositories/AppStateRepository";
import { CompanyRepository } from "./repositories/CompanyRepository";
import { ConfigHistoryRepository } from "./repositories/ConfigHistoryRepository";
import { JobOutputRepository } from "./repositories/JobOutputRepository";
import { JobRepository } from "./repositories/JobRepository";
import { RunRepository } from "./repositories/RunRepository";
import { SentJobRepository } from "./repositories/SentJobRepository";
import { SqliteApiUsageRepository } from "./repositories/SqliteApiUsageRepository";
import { SqliteAppStateRepository } from "./repositories/SqliteAppStateRepository";
import { SqliteCompanyRepository } from "./repositories/SqliteCompanyRepository";
import { SqliteConfigHistoryRepository } from "./repositories/SqliteConfigHistoryRepository";
import { SqliteJobOutputRepository } from "./repositories/SqliteJobOutputRepository";
import { SqliteJobRepository } from "./repositories/SqliteJobRepository";
import { SqliteRunRepository } from "./repositories/SqliteRunRepository";
import { SqliteSentJobRepository } from "./repositories/SqliteSentJobRepository";

// One connection is shared so a transaction in one repository can see another repository's writes.
export class RepositoryFactory {
  private readonly jobRepository: JobRepository;
  private readonly jobOutputRepository: JobOutputRepository;
  private readonly sentJobRepository: SentJobRepository;
  private readonly companyRepository: CompanyRepository;
  private readonly runRepository: RunRepository;
  private readonly appStateRepository: AppStateRepository;
  private readonly apiUsageRepository: ApiUsageRepository;
  private readonly configHistoryRepository: ConfigHistoryRepository;

  public constructor(database: SqliteDatabase) {
    const errorSanitizer: ErrorSanitizer = new ErrorSanitizer();
    this.jobRepository = new SqliteJobRepository(database.getConnection());
    this.jobOutputRepository = new SqliteJobOutputRepository(database.getConnection());
    this.sentJobRepository = new SqliteSentJobRepository(database.getConnection());
    this.companyRepository = new SqliteCompanyRepository(database.getConnection());
    this.runRepository = new SqliteRunRepository(database.getConnection(), errorSanitizer);
    this.appStateRepository = new SqliteAppStateRepository(database.getConnection());
    this.apiUsageRepository = new SqliteApiUsageRepository(database.getConnection());
    this.configHistoryRepository = new SqliteConfigHistoryRepository(database.getConnection());
  }

  public jobs(): JobRepository {
    return this.jobRepository;
  }

  public jobOutputs(): JobOutputRepository {
    return this.jobOutputRepository;
  }

  public sentJobs(): SentJobRepository {
    return this.sentJobRepository;
  }

  public companies(): CompanyRepository {
    return this.companyRepository;
  }

  public runs(): RunRepository {
    return this.runRepository;
  }

  public appState(): AppStateRepository {
    return this.appStateRepository;
  }

  public apiUsage(): ApiUsageRepository {
    return this.apiUsageRepository;
  }

  public configHistory(): ConfigHistoryRepository {
    return this.configHistoryRepository;
  }
}
