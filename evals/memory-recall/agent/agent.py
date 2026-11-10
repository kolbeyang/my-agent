import json
from harbor.agents.installed.base import BaseInstalledAgent
from harbor.agents.installed.base import with_prompt_template


class PersonalAssistantDriver(BaseInstalledAgent):
    @staticmethod
    def name():
        return 'personal-assistant-driver'

    async def install(self, environment):
        pass

    @with_prompt_template
    async def run(self, instruction, environment, context):
        await self.exec_as_agent(environment, command='sh /opt/harness/start.sh', timeout_sec=90)
        await self.exec_as_agent(environment, command='python3 /opt/harness/drive.py', timeout_sec=165)

    def populate_context_post_run(self, context):
        try:
            context.metadata = {'result': json.loads((self.logs_dir / 'result.json').read_text())}
        except (OSError, TypeError):
            pass
