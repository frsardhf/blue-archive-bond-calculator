import { ref, computed, watch } from 'vue';
import { StudentProps } from '../../types/student';
import {
  Material,
  SkillType,
  SkillLevels,
  PotentialType,
  PotentialLevels,
  CREDITS_ID,
  WORKBOOK_ID,
  SECRET_TECH_NOTE_ID,
  DEFAULT_SKILL_LEVELS,
  DEFAULT_POTENTIAL_LEVELS,
  DEFAULT_CHARACTER_LEVELS,
  CharacterLevels
} from '../../types/upgrade';
import { 
  getResourceDataById, 
  loadFormDataToRefs, 
  saveFormData
} from '../utils/studentStorage';
import { consolidateAndSortMaterials } from '../utils/materialUtils';
import dataTable from '../../data/data.json';
import { updateMaterialsData } from '../stores/materialsStore';
import { updateStudentData } from '../stores/studentStore';

export function calculateLevelMaterials(
  student: StudentProps | null,
  characterLevels: CharacterLevels
): Material[] {
  const materialsNeeded: Material[] = [];

  if (!student?.Id) return materialsNeeded;
  if (characterLevels.current >= characterLevels.target) return materialsNeeded;

  const creditsData = getResourceDataById(CREDITS_ID);
  const characterXpTable = dataTable.character_xp;
  
  const currentXp = characterXpTable[characterLevels.current - 1] ?? 0;
  const targetXp = characterXpTable[characterLevels.target - 1] ?? 0;
  const totalXpNeeded = Math.max(0, targetXp - currentXp);
  
  if (totalXpNeeded <= 0) return materialsNeeded;

  // Add credits for level upgrade
  if (creditsData) {
    const characterXpCreditsTable = dataTable.character_credits ?? [];
    let creditsCost = 0;
    
    if (characterXpCreditsTable.length > 0) {
      const currentLevelCreditCost = characterLevels.current > 0 ? 
        characterXpCreditsTable[characterLevels.current - 1] : 0;
      const targetLevelCreditCost = characterLevels.target > 0 ? 
        characterXpCreditsTable[characterLevels.target - 1] : 0;
        
      creditsCost = targetLevelCreditCost - currentLevelCreditCost;
    }
    
    if (creditsCost > 0) {
      materialsNeeded.push({
        material: creditsData,
        materialQuantity: creditsCost,
        type: 'credits'
      });
    }
  }

  return materialsNeeded;
}

export function calculateSkillMaterials(
  student: StudentProps | null,
  skillLevels: SkillLevels
): Material[] {
  const materialsNeeded: Material[] = [];
 
  if (!student?.Id) return materialsNeeded;

  const creditsData = getResourceDataById(CREDITS_ID);
  const exskillCreditsTable = dataTable.exskill_credits;
  const skillCreditsTable = dataTable.skill_credits;

  Object.entries(skillLevels).forEach(([type, levels]) => {
    const { current, target } = levels;
    
    if (current >= target) return;

    let materialIds: number[][] | null = null;
    let materialQuantities: number[][] | null = null;
    let creditsQuantities: number[] | null = null;

    // Determine which material data to use based on skill type
    if (type === 'Ex') {
      materialIds = student?.SkillExMaterial ?? null;
      materialQuantities = student?.SkillExMaterialAmount ?? null;
      creditsQuantities = exskillCreditsTable;
    } else {
      materialIds = student?.SkillMaterial ?? null;
      materialQuantities = student?.SkillMaterialAmount ?? null;
      creditsQuantities = skillCreditsTable;
    }

    if (!materialIds || !materialQuantities) return;

    // Calculate materials for each level
    for (let level = current; level < target; level++) {

      const levelMaterialIds = materialIds[level-1];
      const levelMaterialQuantities = materialQuantities[level-1];
      const levelCreditsQuantities = creditsQuantities[level-1];

      // Special case: Add SECRET_TECH_NOTE for level 9 to 10 for non-Ex skills
      if (level === 9 && type !== 'Ex') {
        const secretTechData = getResourceDataById(SECRET_TECH_NOTE_ID);
        materialsNeeded.push({
          material: secretTechData,
          materialQuantity: 1,
          type: 'special'
        });

        materialsNeeded.push({
          material: creditsData,
          materialQuantity: 4000000,
          type: 'credits'
        });
      }

      // Needs to be placed after special case since 
      // levelMaterialIds.length === N-1, Ex max length is 5, Non Ex max length is 10
      if (!levelMaterialIds || !levelMaterialQuantities) continue;
      
      // Each level may need multiple materials, process each one
      for (let i = 0; i < levelMaterialIds.length; i++) {
        const materialId = levelMaterialIds[i];
        const quantity = levelMaterialQuantities[i];
        
        if (!materialId || !quantity) continue;
        
        const materialData = getResourceDataById(materialId);
        
        materialsNeeded.push({
          material: materialData,
          materialQuantity: quantity,
          type: 'materials'
        });
      }

      materialsNeeded.push({
        material: creditsData,
        materialQuantity: levelCreditsQuantities,
        type: 'credits'
      });
    }
  });
  
  return materialsNeeded;
}

export function calculatePotentialMaterials(
  student: StudentProps | null,
  potentialLevels: PotentialLevels
): Material[] {
  const materialsNeeded: Material[] = [];

  if (!student?.Id || !dataTable.potential) return materialsNeeded;

  const potentialMaterials = dataTable.potential;
  const creditsData = getResourceDataById(CREDITS_ID);

  function processPotentialBlock(
    type: string,
    block: number,
    current: number,
    target: number
  ): Material[] {
    const result: Material[] = [];
    if (block >= potentialMaterials.length) return result;

    const blockData = potentialMaterials[block];
    if (!blockData) return result;

    let levelsInBlock = 5;
    if (block === Math.floor(current / 5)) {
      levelsInBlock = 5 - (current % 5);
    }
    if (block === Math.floor((target - 1) / 5)) {
      const remainder = target % 5;
      if (remainder > 0) {
        levelsInBlock = remainder;
      }
    }

    const [workbookQuantity, materialQuality, materialQuantity, creditsQuantity] = blockData;

    let workbookIndex: number;
    if (type === 'maxhp') {
      workbookIndex = 0;
    } else if (type === 'attack') {
      workbookIndex = 1;
    } else {
      workbookIndex = 2;
    }
    const workbookId = WORKBOOK_ID[workbookIndex];
    const materialId = student?.PotentialMaterial ?? 0;
    const actualMaterialId = materialQuality === 1 ? materialId : materialId + 1;

    const materialData = getResourceDataById(actualMaterialId);
    const workbookData = getResourceDataById(workbookId);

    const scaledMaterialQuantity = Math.ceil(materialQuantity * levelsInBlock);
    const scaledWorkbookQuantity = Math.ceil(workbookQuantity * levelsInBlock);
    const scaledCreditsQuantity = Math.ceil(creditsQuantity * levelsInBlock);

    result.push(
      {
        material: materialData,
        materialQuantity: scaledMaterialQuantity,
        type: 'materials'
      },
      {
        material: workbookData,
        materialQuantity: scaledWorkbookQuantity,
        type: 'materials'
      },
      {
        material: creditsData,
        materialQuantity: scaledCreditsQuantity,
        type: 'credits'
      }
    );
    return result;
  }

  Object.entries(potentialLevels).forEach(([type, levels]) => {
    const { current, target } = levels;
    if (current >= target) return;

    const startBlock = Math.floor(current / 5);
    const endBlock = Math.floor((target - 1) / 5);

    for (let block = startBlock; block <= endBlock; block++) {
      const blockMaterials = processPotentialBlock(type, block, current, target);
      materialsNeeded.push(...blockMaterials);
    }
  });

  return materialsNeeded;
}

export function calculateAllMaterials(
  student: StudentProps | null,
  characterLevels: CharacterLevels,
  skillLevels: SkillLevels,
  potentialLevels: PotentialLevels,
): Material[] {
  if (!student) return [];
  
  // Collect all materials
  const materials: Material[] = [];
  materials.push(...calculateLevelMaterials(student, characterLevels));
  materials.push(...calculateSkillMaterials(student, skillLevels));
  materials.push(...calculatePotentialMaterials(student, potentialLevels));
  
  // Consolidate and sort materials
  return consolidateAndSortMaterials(materials);
}

export function useStudentUpgrade(props: {
  student: StudentProps | null,
  isVisible?: boolean
}, emit: (event: 'close') => void) {

  const characterLevels = ref<CharacterLevels>({...DEFAULT_CHARACTER_LEVELS});
  const skillLevels = ref<SkillLevels>({...DEFAULT_SKILL_LEVELS});
  const potentialLevels = ref<PotentialLevels>({...DEFAULT_POTENTIAL_LEVELS});
  const allSkillsMaxed = ref(false);
  const targetSkillsMaxed = ref(false);
  
  const characterXpTable = dataTable.character_xp;
  const potentialMaterials = dataTable.potential;

  const checkAllSkillsMaxed = () => {
    return Object.entries(skillLevels.value).every(([type, levels]) => {
      const student = props.student as Record<string, any>;
      const maxLevel = student?.Skills?.[type]?.Parameters?.[0]?.length;
      return levels.current === maxLevel && levels.target === maxLevel;
    });
  };
  
  const checkTargetSkillsMaxed = () => {
    return Object.entries(skillLevels.value).every(([type, levels]) => {
      const student = props.student as Record<string, any>;
      const maxLevel = student?.Skills?.[type]?.Parameters?.[0]?.length;
      return levels.target === maxLevel;
    });
  };

  const toggleMaxAllSkills = (checked: boolean) => {
    Object.keys(skillLevels.value).forEach((type) => {
      const skillType = type as SkillType;
      const student = props.student as Record<string, any>;
      const maxLevel = student?.Skills?.[skillType]?.Parameters?.[0]?.length
      
      if (checked) {
        skillLevels.value[skillType].current = maxLevel;
        skillLevels.value[skillType].target = maxLevel;
      } else {
        skillLevels.value[skillType].current = 1;
        skillLevels.value[skillType].target = 1;
      }
    });
    
    allSkillsMaxed.value = checked;
    targetSkillsMaxed.value = checked;
    
    saveToLocalStorage();
    if (props.student) {
      updateStudentData(props.student.Id);
    }
  };
  
  const toggleMaxTargetSkills = (checked: boolean) => {
    Object.keys(skillLevels.value).forEach((type) => {
      const skillType = type as SkillType;
      const student = props.student as Record<string, any>;
      const maxLevel = student?.Skills?.[skillType]?.Parameters?.[0]?.length
      
      if (checked) {
        skillLevels.value[skillType].target = maxLevel;
        if (skillLevels.value[skillType].current > maxLevel) {
          skillLevels.value[skillType].current = maxLevel;
        }
      } else {
        skillLevels.value[skillType].target = skillLevels.value[skillType].current;
      }
    });
    
    targetSkillsMaxed.value = checked;
    allSkillsMaxed.value = checkAllSkillsMaxed();
    
    saveToLocalStorage();
    if (props.student) {
      updateStudentData(props.student.Id);
    }
  };

  function resetFormData() {
    characterLevels.value = {...DEFAULT_CHARACTER_LEVELS};
    skillLevels.value = {...DEFAULT_SKILL_LEVELS};
    potentialLevels.value = {...DEFAULT_POTENTIAL_LEVELS};
  }

  // Watch for changes to isVisible to load data when modal opens
  watch(() => props.isVisible, (newValue) => {
    if (newValue && props.student) {
      setTimeout(() => {
        loadFromLocalStorage();
      }, 50);
    }
  }, { immediate: true });

  // Watch for changes to the student prop to reset form when student changes
  watch(() => props.student, (newValue) => {
    if (newValue) {
      resetFormData();
      if (props.isVisible) {
        loadFromLocalStorage();
      }
    }
  });

  // Watch for changes to form data and save to localStorage
  watch([characterLevels, skillLevels, potentialLevels], () => {
    if (props.student && props.isVisible) {
      saveToLocalStorage();
      updateStudentData(props.student.Id);
    }
  }, { deep: true });

  watch(skillLevels, () => {
    allSkillsMaxed.value = checkAllSkillsMaxed();
    targetSkillsMaxed.value = checkTargetSkillsMaxed();
  }, { deep: true });

  function saveToLocalStorage() {
    if (!props.student) return;
    
    const dataToSave = {
      characterLevels: characterLevels.value,
      skillLevels: skillLevels.value,
      potentialLevels: potentialLevels.value
    };

    saveFormData(props.student.Id, dataToSave);
  }

  function loadFromLocalStorage() {
    if (!props.student) return;

    const refs = {
      characterLevels,
      skillLevels,
      potentialLevels
    };
    
    const defaultValues = {
      characterLevels: DEFAULT_CHARACTER_LEVELS,
      skillLevels: DEFAULT_SKILL_LEVELS,
      potentialLevels: DEFAULT_POTENTIAL_LEVELS
    };
    
    const success = loadFormDataToRefs(props.student.Id, refs, defaultValues);

    if (!success || Object.keys(skillLevels.value).length === 0) {
      characterLevels.value = defaultValues.characterLevels;
      skillLevels.value = defaultValues.skillLevels;
      potentialLevels.value = defaultValues.potentialLevels;
      
      saveToLocalStorage();
    }
    
    if (props.student) {
      updateStudentData(props.student.Id);
    }
  }

  const totalCumulativeExp = computed(() => {
    const currentXp = characterXpTable[characterLevels.value.current - 1] ?? 0;
    const targetXp = characterXpTable[characterLevels.value.target - 1] ?? 0;
    return Math.max(0, targetXp - currentXp);
  });

  const remainingXp = computed(() => {
    return totalCumulativeExp.value;
  });

  const levelMaterialsNeeded = computed<Material[]>(() => {
    return calculateLevelMaterials(props.student, characterLevels.value);
  });

  const skillMaterialsNeeded = computed<Material[]>(() => {
    return calculateSkillMaterials(props.student, skillLevels.value);
  });

  const potentialMaterialsNeeded = computed<Material[]>(() => {
    return calculatePotentialMaterials(props.student, potentialLevels.value);
  });

  // Create a computed property for all materials needed for this student
  const allMaterialsNeeded = computed<Material[]>(() => {
    if (!props.student) return [];
    
    const sortedMaterials = calculateAllMaterials(
      props.student,
      characterLevels.value,
      skillLevels.value,
      potentialLevels.value,
    );
    
    updateMaterialsData(props.student.Id, sortedMaterials);
    
    return sortedMaterials;
  });

  // Function to handle both current and target level updates
  const handleLevelUpdate = (current: number, target: number) => {
    if (current >= 1 && target >= current) {
      characterLevels.value.current = current;
      characterLevels.value.target = target;
      
      if (props.student && props.isVisible) {
        saveToLocalStorage();
        updateStudentData(props.student.Id);
      }
    }
  };

  // Function to handle updates for skill levels
  const handleSkillUpdate = (type: SkillType, current: number, target: number) => {
    if (current >= 1 && target >= current) {
      if (skillLevels.value[type]) {
        skillLevels.value[type].current = current;
        skillLevels.value[type].target = target;
        
        if (props.student && props.isVisible) {
          saveToLocalStorage();
          updateStudentData(props.student.Id);
        }
      }
    }
  };

  // Function to handle updates from all potential types
  const handlePotentialUpdate = (type: PotentialType, current: number, target: number) => {
    if (current >= 0 && target >= current) {
      if (potentialLevels.value[type]) {
        potentialLevels.value[type].current = current;
        potentialLevels.value[type].target = target;
        
        if (props.student && props.isVisible) {
          saveToLocalStorage();
          updateStudentData(props.student.Id);
        }
      }
    }
  };

  function closeModal() {
    saveToLocalStorage();
    if (props.student) {
      updateStudentData(props.student.Id);
    }
    emit('close');
  }

  return {
    // State
    characterLevels,
    potentialLevels,
    skillLevels,
    potentialMaterials,
    
    // Computed
    totalCumulativeExp,
    remainingXp,
    potentialMaterialsNeeded,
    skillMaterialsNeeded,
    levelMaterialsNeeded,
    allMaterialsNeeded,

    // Methods
    closeModal,
    resetFormData,
    saveToLocalStorage,
    loadFromLocalStorage,
    handleLevelUpdate,
    handlePotentialUpdate,
    handleSkillUpdate,
    allSkillsMaxed,
    checkAllSkillsMaxed,
    toggleMaxAllSkills,
    toggleMaxTargetSkills,
    targetSkillsMaxed,
    checkTargetSkillsMaxed
  };
}