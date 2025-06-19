I do not need apps/server. I only need typescipt sdk to make make ability implement workflow and use in into other ts application powered by bun. i need workflow cli only for debug typescript implemented workflow, access to db and check logs, errors and states of exection in terminal. but, i need same functionality in typescipt sdk for workflow


update OVERVIEW.md and DEVELOPER_GUIDE.md based on my request


- mkdir -p tests/{unit,integration,e2e} - incorrect?
- before implementation crate full file stuctore and OVERVIEW.md per packages with detail expanations for implementaion
- if it make sense to separate "database" into package?
- explane how Logger works?
- app/cli with bun single-file executon
- biome v2
- for zod scehema add description for every parameter. make memo for it into DEVELOPER_GUIDE.md
- add some kind of recovery if it not possible to connect ot sqlite or write to it. need make debug logs
- add ".workflow" folder, make to store db and logs where
- parrallel execution
- transcation + rollaback / commit
- in DEVELOPER_GUIDE.md re-think WorkflowRegistry into drizzle-orm like design/implemenation way, use zod
- migration control?
- use our tui lib to implement cli interface
- where db will be store? make it customizuble from sdk
- add sqllite panic support behavior, like db lock
- review for duplication and not clear logic
- mark cli to skip
- update PROGRESS.md based on DEVELOPER_GUIDE.md and OVERVIEW.md
- update OVERVIEW.md based on DEVELOPER_GUIDE.md
- create template and prompt