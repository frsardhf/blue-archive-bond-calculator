// Define potential types
export type SkillType = 'Ex' | 'Public' | 'Passive' | 'ExtraPassive';
export type PotentialType = 'attack' | 'maxhp' | 'healpower';

export interface Material {
  material: Record<string, any> | null;
  materialQuantity: number;
  type?: SkillType | PotentialType | 'level';
}
export interface SkillLevels {
  Ex: {
    current: number;
    target: number;
  };
  Public: {
    current: number;
    target: number;
  };
  Passive: {
    current: number;
    target: number;
  };
  ExtraPassive: {
    current: number;
    target: number;
  };
}

export interface PotentialLevels {
  attack: {
    current: number;
    target: number;
  };
  maxhp: {
    current: number;
    target: number;
  };
  healpower: {
    current: number;
    target: number;
  };
}

export interface SkillSettings extends PotentialSettings {
  maxLevel: number;
}

export interface PotentialSettings {
  current: number;
  target: number;
  icon: string;
  name: string;
}

// Constants
export const CREDITS_ID = 5;

export const EXP_REPORT_ID = [10, 11, 12, 13];

export const WORKBOOK_ID = [2000, 2001, 2002];

export const SECRET_TECH_NOTE_ID = 9999;
