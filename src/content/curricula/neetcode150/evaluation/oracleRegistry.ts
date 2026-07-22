import { mergeProblemMissionOracleRegistries } from './oracleContract'
import { REALM_1_PROBLEM_MISSION_ORACLES } from './oracles/realm1'
import { REALM_2_PROBLEM_MISSION_ORACLES } from './oracles/realm2'
import { REALM_3_PROBLEM_MISSION_ORACLES } from './oracles/realm3'
import { REALM_4_PROBLEM_MISSION_ORACLES } from './oracles/realm4'
import { REALM_5_PROBLEM_MISSION_ORACLES } from './oracles/realm5'
import { REALM_6_PROBLEM_MISSION_ORACLES } from './oracles/realm6'

export const NEETCODE_150_PROBLEM_MISSION_ORACLES =
  mergeProblemMissionOracleRegistries(
    REALM_1_PROBLEM_MISSION_ORACLES,
    REALM_2_PROBLEM_MISSION_ORACLES,
    REALM_3_PROBLEM_MISSION_ORACLES,
    REALM_4_PROBLEM_MISSION_ORACLES,
    REALM_5_PROBLEM_MISSION_ORACLES,
    REALM_6_PROBLEM_MISSION_ORACLES,
  )
