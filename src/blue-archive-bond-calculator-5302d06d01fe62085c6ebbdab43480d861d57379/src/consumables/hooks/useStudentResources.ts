import { ref, watch } from 'vue';
import { StudentProps } from '../../types/student';
import { getResources, saveResourcesFromStudent } from '../utils/studentStorage';

export function useStudentResources(props: { 
  student: StudentProps | null,
  isVisible?: boolean
}, emit: (event: 'close') => void) {
  const resourceFormData = ref<Record<string, number>>({});

  function handleResourceInput(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value) || 0;
    resourceFormData.value[id] = value;
  }

  // Watch for changes to isVisible to load data when modal opens
  watch(() => props.isVisible, (newValue) => {
    if (newValue && props.student) {
      setTimeout(() => {
        loadResources();
      }, 50);
    }
  }, { immediate: true });

  // Watch for changes to the student prop to reset form when student changes
  watch(() => props.student, (newValue) => {
    if (newValue) {
      if (props.isVisible) {
        loadResources();
      }
    }
  });

  // Watch for changes to form data and save to localStorage
  watch([resourceFormData], () => {
    if (props.student && props.isVisible) {
      saveResources();
    }
  }, { deep: true });

  function loadResources() {
    try {
      const resources = getResources();
      if (resources) {
        const quantities: Record<string, number> = {};
        
        // Extract quantities from the stored material objects
        Object.values(resources).forEach((material: any) => {
          if (material && material.Id !== undefined && material.QuantityOwned !== undefined) {
            quantities[material.Id] = material.QuantityOwned;
          }
        });
        
        resourceFormData.value = quantities;
      }
    } catch (error) {
      console.error('Error retrieving resources from localStorage:', error);
    }
  }

  function saveResources() {
    if (!props.student?.Materials) return;

    saveResourcesFromStudent(props.student, resourceFormData);
  }

  return {
    resourceFormData,
    handleResourceInput
  };
}
