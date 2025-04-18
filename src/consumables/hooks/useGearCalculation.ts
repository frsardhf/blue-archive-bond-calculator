import { computed, ref } from 'vue';
import { getDataCollection, getEquipments, getResourceDataById } from '../utils/studentStorage';
import { StudentProps } from '../../types/student';
import { EquipmentType } from '../../types/equipment';
import { CREDITS_ID } from '../../types/upgrade';
import dataTable from '../../data/data.json';

interface EquipmentMaterialSummary {
  material: Record<string, any> | null;
  materialQuantity: number;
  owned: number;
  remaining: number;
}

interface StudentEquipmentUsage {
  student: StudentProps;
  quantity: number;
  equipmentType: EquipmentType;
}

export function useGearCalculation() {
  // Track student-specific equipment material usage
  const equipmentMaterialUsageByStudents = new Map<number, StudentEquipmentUsage[]>();
  
  // Track equipment credits separately
  const equipmentCreditsNeeded = ref<{
    totalCredits: number;
    studentCredits: Map<number, { student: StudentProps; quantity: number }>;
  }>({
    totalCredits: 0,
    studentCredits: new Map()
  });

  // Get all students with their equipment data
  const getAllStudentsWithEquipment = () => {
    const studentsData = getDataCollection('students') as Record<string, StudentProps>;
    const formsData = getDataCollection('forms');
    
    // Filter out students that don't have equipment data
    return Object.values(studentsData).filter(student => {
      return formsData[student.Id]?.equipmentLevels;
    }).map(student => {
      return {
        student,
        equipmentLevels: formsData[student.Id].equipmentLevels
      };
    });
  };

  // Function to get equipment materials needed for a specific tier
  const getEquipmentMaterialsForTier = (type: string, tier: number, studentId: number | string) => {
    const equipments = getEquipments();
    if (!equipments) return [];

    // Find the equipment item that matches the type and tier
    const equipmentItem = Object.values(equipments).find(
      (item: any) => item.Category === type && item.Tier === tier
    );

    if (!equipmentItem?.Recipe) return [];

    const materials: {
      material: any;
      materialQuantity: number;
      equipmentType: EquipmentType;
      studentId: number | string;
    }[] = [];
    
    // Process each recipe item
    for (const recipe of equipmentItem.Recipe) {
      const recipeId = recipe[0];
      const quantity = recipe[1];
      
      if (!recipeId || !quantity) continue;
      
      // Convert equipment ID to material ID by removing first two digits
      const materialId = parseInt(recipeId.toString().substring(2));
      
      // Get material data
      const materialData = getEquipmentById(materialId);
      
      if (materialData) {
        materials.push({
          material: materialData,
          materialQuantity: quantity,
          equipmentType: type as EquipmentType,
          studentId
        });
      }
    }

    return materials;
  };

  // Get equipment data by ID
  const getEquipmentById = (id: number) => {
    const equipments = getEquipments();
    if (!equipments) return null;

    // Look for the equipment piece by ID
    for (const key in equipments) {
      const equipment = equipments[key];
      if (equipment.Id === id) {
        return equipment;
      }
    }
    
    // If not found, try to find in resources (for credits)
    if (id === CREDITS_ID) {
      const resource = getResourceDataById(CREDITS_ID);
      return resource || null;
    }
    
    return null;
  };

  // Calculate all equipment materials needed for all students
  const calculateTotalEquipmentNeeded = () => {
    const studentsWithEquipment = getAllStudentsWithEquipment();
    const materialMap = new Map<number, EquipmentMaterialSummary>();
    
    // Reset material usage tracking
    equipmentMaterialUsageByStudents.clear();
    
    // Reset equipment credits tracking
    equipmentCreditsNeeded.value = {
      totalCredits: 0,
      studentCredits: new Map()
    };
    
    // Process each student's equipment
    studentsWithEquipment.forEach(({ student, equipmentLevels }) => {
      // Skip if no equipment data
      if (!equipmentLevels) return;
      
      // Process each equipment type
      Object.entries(equipmentLevels).forEach(([type, levels]) => {
        const { current, target } = levels as { current: number; target: number };
        
        // Skip if no upgrade needed
        if (current >= target) return;
        
        // Calculate materials for each level from current to target-1
        for (let level = current; level < target; level++) {
          const nextTier = level + 1;
          const materials = getEquipmentMaterialsForTier(type, nextTier, student.Id);
          
          // Process each material
          materials.forEach(material => {
            const materialId = material.material?.Id;
            if (!materialId) return;
            
            // Skip credits handling here, we'll handle it separately
            if (materialId !== CREDITS_ID) {
              // Track usage by student
              trackMaterialUsage(student, materialId, material.materialQuantity, type as EquipmentType);
              
              // Add to material map
              updateMaterialMap(materialId, material.material, material.materialQuantity, materialMap);
            }
          });
        }

        // Add credits for this target cumulative but track separately
        const creditsQuantity = getCreditsForEquipmentTier(current, target);
        if (creditsQuantity > 0) {
          // Track this student's equipment credit usage
          trackEquipmentCreditsUsage(student, creditsQuantity);
        }
      });
    });
    
    // Convert map to array and sort by ID
    return Array.from(materialMap.values())
      .sort((a, b) => {
        // Then sort by ID
        return (a.material?.Id || 0) - (b.material?.Id || 0);
      });
  };

  // Get credits required for a specific equipment tier
  const getCreditsForEquipmentTier = (current: number, target: number) => {
    // Credits table for equipment tiers
    const equipmentCreditsTable = dataTable.equipment_credits;
    
    // When current is 1, we need the full amount for target
    if (current === 1) {
      return equipmentCreditsTable[target-2] || 0;
    }
    
    // For other levels, calculate the difference
    const creditsNeeded = equipmentCreditsTable[target-2] - equipmentCreditsTable[current-2];
    return creditsNeeded || 0;
  };

  // Helper to track which students use which equipment materials
  const trackMaterialUsage = (
    student: StudentProps,
    materialId: number,
    quantity: number,
    equipmentType: EquipmentType
  ) => {
    if (!equipmentMaterialUsageByStudents.has(materialId)) {
      equipmentMaterialUsageByStudents.set(materialId, []);
    }
    
    const usageList = equipmentMaterialUsageByStudents.get(materialId)!;
    
    // For credits, just combine by student instead of by equipment type
    if (materialId === CREDITS_ID) {
      const existingEntry = usageList.find(entry => entry.student.Id === student.Id);
      
      if (existingEntry) {
        // Update the existing entry (just add the quantity)
        existingEntry.quantity += quantity;
      } else {
        // Add a new entry with "All" type
        usageList.push({
          student,
          quantity,
          equipmentType: "All" as unknown as EquipmentType
        });
      }
    } else {
      // For regular materials, continue tracking by student + equipment type
      const existingEntry = usageList.find(
        entry => entry.student.Id === student.Id && entry.equipmentType === equipmentType
      );
      
      if (existingEntry) {
        // Update the existing entry
        existingEntry.quantity += quantity;
      } else {
        // Add a new entry
        usageList.push({
          student,
          quantity,
          equipmentType
        });
      }
    }
  };

  // Helper to track equipment credits usage by student
  const trackEquipmentCreditsUsage = (
    student: StudentProps,
    quantity: number
  ) => {
    // Update total credits needed
    equipmentCreditsNeeded.value.totalCredits += quantity;
    
    // Update student-specific credits
    const studentId = student.Id;
    if (equipmentCreditsNeeded.value.studentCredits.has(studentId)) {
      // Update existing entry
      const existingEntry = equipmentCreditsNeeded.value.studentCredits.get(studentId)!;
      existingEntry.quantity += quantity;
    } else {
      // Add new entry
      equipmentCreditsNeeded.value.studentCredits.set(studentId, {
        student,
        quantity
      });
    }
  };

  // Helper to update material map with new quantities
  const updateMaterialMap = (
    materialId: number,
    material: Record<string, any> | null,
    quantity: number,
    materialMap: Map<number, EquipmentMaterialSummary>
  ) => {
    // Get all equipments to find owned quantities
    const equipments = getEquipments() || {};
    
    // Special case for credits which are in resources, not equipments
    const owned = materialId === CREDITS_ID 
      ? (getResourceDataById(CREDITS_ID)?.QuantityOwned || 0)
      : (equipments[materialId.toString()]?.QuantityOwned || 0);
    
    if (materialMap.has(materialId)) {
      // Update existing entry
      const existingEntry = materialMap.get(materialId)!;
      existingEntry.materialQuantity += quantity;
      existingEntry.remaining = existingEntry.owned - existingEntry.materialQuantity;
    } else {
      // Create new entry
      materialMap.set(materialId, {
        material: material || { 
          Id: materialId, 
          Name: `Unknown (${materialId})`, 
          Icon: materialId.toString()
        },
        materialQuantity: quantity,
        owned: owned,
        remaining: owned - quantity
      });
    }
  };

  // Get the list of students using a specific equipment material
  const getEquipmentUsageByStudents = (materialId: number): StudentEquipmentUsage[] => {
    return equipmentMaterialUsageByStudents.get(materialId) || [];
  };

  // Equipment materials needed across all students
  const totalEquipmentNeeded = computed(() => {
    return calculateTotalEquipmentNeeded();
  });

  // Equipment materials leftover after subtracting needed from owned
  const equipmentLeftover = computed(() => {
    const neededMap = new Map(
      totalEquipmentNeeded.value.map(item => [item.material?.Id, item])
    );
    
    // Get all equipment resources
    const equipments = getEquipments() || {};
    
    // Create a list of all unique equipment materials (include both owned and needed materials)
    const allMaterialIds = new Set([
      ...Object.keys(equipments).map(id => parseInt(id)),
      ...Array.from(neededMap.keys())
    ]);
    
    // Calculate leftover for each material
    const leftoverList = Array.from(allMaterialIds).map(id => {
      const needed = neededMap.get(id);
      
      // Special case for credits which are in resources, not equipments
      let owned = 0;
      if (id === CREDITS_ID) {
        const resourceData = getResourceDataById(CREDITS_ID);
        owned = resourceData?.QuantityOwned || 0;
      } else {
        owned = equipments[id.toString()]?.QuantityOwned || 0;
      }
      
      const neededQuantity = needed?.materialQuantity || 0;
      const remaining = owned - neededQuantity;
      
      return {
        material: needed?.material || equipments[id.toString()] || { 
          Id: id, 
          Name: `Unknown (${id})`,
          Icon: id.toString() 
        },
        owned,
        materialQuantity: neededQuantity,
        remaining
      };
    }).sort((a, b) => {
      // Sort by ID
      return (a.material?.Id || 0) - (b.material?.Id || 0);
    });
    
    return leftoverList;
  });

  // Missing equipment materials (negative leftover)
  const missingEquipment = computed(() => {
    return equipmentLeftover.value
      .filter(item => item.remaining < 0)
      .sort((a, b) => a.remaining - b.remaining); // Sort by most negative first
  });

  // Get the equipment credits data
  const getEquipmentCredits = () => {
    return {
      totalCredits: equipmentCreditsNeeded.value.totalCredits,
      studentCredits: Array.from(equipmentCreditsNeeded.value.studentCredits.values())
    };
  };

  // Add a timer ref to track the last refresh
  const lastRefreshTime = ref(Date.now());
  const refreshTimeout = ref<number | null>(null);
  const COOLDOWN_DURATION = 1000; // 1 second cooldown

  // Debounced refresh function
  const debouncedRefresh = () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.value;

    // Clear any existing timeout
    if (refreshTimeout.value !== null) {
      clearTimeout(refreshTimeout.value);
    }

    // If we're past the cooldown, refresh immediately
    if (timeSinceLastRefresh >= COOLDOWN_DURATION) {
      refreshData();
      lastRefreshTime.value = now;
    } else {
      // Otherwise, schedule a refresh for when the cooldown ends
      refreshTimeout.value = window.setTimeout(() => {
        refreshData();
        lastRefreshTime.value = Date.now();
      }, COOLDOWN_DURATION - timeSinceLastRefresh);
    }
  };

  // Immediate refresh function for critical updates
  const immediateRefresh = () => {
    refreshData();
    lastRefreshTime.value = Date.now();
  };

  // Original refresh function
  const refreshData = () => {
    // This will trigger recomputation of all computed properties
    const dummy = ref(Date.now());
    dummy.value = Date.now();
    
    // Calculate total equipment materials needed to ensure the usage map is filled
    calculateTotalEquipmentNeeded();
  };

  // Initial calculation to populate usage data
  calculateTotalEquipmentNeeded();

  return {
    totalEquipmentNeeded,
    equipmentLeftover,
    missingEquipment,
    refreshData: debouncedRefresh,
    immediateRefresh,
    getEquipmentUsageByStudents,
    getEquipmentCredits 
  };
}
