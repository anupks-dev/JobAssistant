import { SystemClock } from "../../fetchers/Clock";
import { ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { ScoreOnceOptions, ScoreOnceOptionsParser } from "./ScoreOnceOptions";
import { ScoreOnceRunner } from "./ScoreOnceRunner";
import { ScoringCommand, ScoringSession } from "./ScoringCommand";

// Wires score:once. The flow itself lives in ScoreOnceRunner so tests can drive it with fakes.
class ScoreOnceCommand {
  public async run(argv: string[]): Promise<void> {
    const options: ScoreOnceOptions = new ScoreOnceOptionsParser().parse(argv);
    const command: ScoringCommand = new ScoringCommand();
    const database: ReturnType<ScoringCommand["openDatabase"]> = command.openDatabase();
    try {
      const session: ScoringSession = command.openSession(command.loadConfig(), database);
      if (options.cleanSkillLists) {
        const changed: number = command.buildCleanupRunner(session).run();
        console.log("Cleaned skill lists of " + String(changed) + " jobs.");
        return;
      }
      const provider: ProfileContextProvider = command.buildContextProvider();
      const runner: ScoreOnceRunner = new ScoreOnceRunner(
        command.buildScorer(session, options.limit),
        session.ranking,
        command.buildOutputGenerator(session),
        provider,
        new SystemClock(),
        { print: (line: string): void => console.log(line) },
      );
      await runner.run(options);
    } finally {
      database.close();
    }
  }
}

new ScoreOnceCommand().run(process.argv.slice(2)).catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Scoring failed.";
  console.error(message);
  process.exit(1);
});
