from harbor.agents.installed.base import BaseInstalledAgent
from harbor.agents.base import with_prompt_template


class MyAgentEval(BaseInstalledAgent):
    @staticmethod
    def name():
        return "my-agent-issues"

    async def install(self, environment):
        pass

    @with_prompt_template
    async def run(self, instruction, environment, context):
        await self.exec_as_agent(environment, command="python3 /opt/harness/seed.py", cwd="/case", timeout_sec=30)
        await self.exec_as_agent(environment, command="bash /opt/harness/start.sh", cwd="/case", env={"AZURE_OPENAI_DEPLOYMENT": self.model_name}, timeout_sec=60)
        await self.exec_as_agent(environment, command="python3 /opt/harness/drive.py", cwd="/case", timeout_sec=220)
