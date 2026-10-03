/** Match membership is independent of authored fighter/roster identity. */
export interface FighterMembership {
      runtimeId: string;
      teamId: string;
      ownerRuntimeId?: string | null;
      collisionGroup?: number;
}

export interface TeamMember { teamId: string; }

export function areTeammates(first: TeamMember, second: TeamMember): boolean {
      return first.teamId === second.teamId;
}

export function areEnemies(first: TeamMember, second: TeamMember): boolean {
      return !areTeammates(first, second);
}
