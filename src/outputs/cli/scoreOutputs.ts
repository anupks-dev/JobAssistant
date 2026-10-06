import { ScoringCommand, ScoringSession } from "../../scoring/cli/ScoringCommand";
import { ScoreOutputsOptions, ScoreOutputsOptionsParser } from "./ScoreOutputsOptions";
import { ScoreOutputsRunner } from "./ScoreOutputsRunner";

// Wires score:outputs. The flow itself lives in ScoreOutputsRunner so tests can drive it with fakes.
class ScoreOutputsCommand {
  public async run(argv: string[]): Promise<void> {
    const options: ScoreOutputsOptions = new ScoreOutputsOptionsParser().parse(argv);
    const command: ScoringCommand = new ScoringCommand();
    const database: ReturnType<ScoringCommand["openDatabase"]> = command.openDatabase();
    try {
      const session: ScoringSession = command.openSession(command.loadConfig(), database);
      const runner: ScoreOutputsRunner = new ScoreOutputsRunner(
        session.factory.jobs(),
        command.buildOutputGenerator(session),
        command.buildContextProvider(),
        { print: (line: string): void => console.log(line) },
      );
      await runner.run(options);
    } finally {
      database.close();
    }
  }
}

new ScoreOutputsCommand().run(process.argv.slice(2)).catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Score outputs failed.";
  console.error(message);
  process.exit(1);
});
