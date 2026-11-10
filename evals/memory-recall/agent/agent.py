import json
from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.models.trajectories import Trajectory


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
        await self.exec_as_agent(
            environment,
            command='python3 /opt/harness/export_trajectory.py',
            env={'AGENT_MODEL_NAME': self.model_name or 'unknown'},
            timeout_sec=20,
        )

    def populate_context_post_run(self, context):
        try:
            context.metadata = {'result': json.loads((self.logs_dir / 'result.json').read_text())}
        except (OSError, TypeError):
            pass
        try:
            Trajectory.model_validate_json((self.logs_dir / 'trajectory.json').read_text())
        except (OSError, ValueError) as exc:
            self.logger.warning('No valid conversation trajectory: %s', exc)
