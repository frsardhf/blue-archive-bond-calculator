// storageUtils.ts

/**
 * Storage keys used throughout the application
 */
export const STORAGE_KEYS = {
  STUDENTS: 'students',
  RESOURCES: 'resources',
  FORMS: 'forms',
  // Add more keys as needed
};

/**
 * Saves studentData to localStorage under the students collection
 * It includes all the data for the student, including favored gifts
 * @param studentData The base student data
 * @param favoredGift The favored gifts data for each student
 * @param giftBoxData The gift boxes data for each student
 * @returns boolean indicating success or failure
 */
export function saveStudentData(
  studentData: Record<string, any>,
  favoredGift: Record<string, any[]>,
  giftBoxData: Record<string, any[]>
): boolean {
  try {
    // Create a copy of studentData to avoid modifying the original
    const updatedStudentData = { ...studentData };

    // Add Gifts and Boxes to each student's data
    for (const studentId in updatedStudentData) {
      // Convert arrays to objects with item IDs as keys
      const giftsObject = (favoredGift[studentId] || []).reduce((acc, item) => {
        acc[item.gift.Id] = item;
        return acc;
      }, {} as Record<string, any>);

      const boxesObject = (giftBoxData[studentId] || []).reduce((acc, item) => {
        acc[item.gift.Id] = item;
        return acc;
      }, {} as Record<string, any>);

      updatedStudentData[studentId] = {
        ...updatedStudentData[studentId],
        Gifts: giftsObject,
        Boxes: boxesObject
      };
    }

    // Save entire students collection back to localStorage
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updatedStudentData));
    return true;
  } catch (error) {
    console.error('Error saving student data to localStorage:', error);
    return false;
  }
}

/**
 * Saves student-specific data to localStorage under the students collection
 * @param studentId The ID of the student
 * @param data The data to save
 * @returns boolean indicating success or failure
 */
export function saveFormData(studentId: string | number, data: Record<string, any>): boolean {
  if (!studentId) return false;
  
  try {
    // Get all students data
    let studentsData = getFormsCollection();
    if (!studentsData) studentsData = {};
    
    // Get existing data for this student
    const existingStudentData = studentsData[studentId] || {};
    
    // Merge with new data
    studentsData[studentId] = {
      ...existingStudentData,
      ...data,
      id: studentId, // Always ensure studentId is saved
    };
    
    // Save entire students collection back to localStorage
    localStorage.setItem(STORAGE_KEYS.FORMS, JSON.stringify(studentsData));
    return true;
  } catch (error) {
    console.error('Error saving student data to localStorage:', error);
    return false;
  }
}

/**
 * Retrieves all students data from localStorage
 * @returns Record of all students or empty object if not found
 */
export function getFormsCollection(): Record<string | number, any> {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FORMS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error retrieving students collection from localStorage:', error);
    return {};
  }
}

/**
 * Retrieves a single student's data from localStorage
 * @param studentId The ID of the student
 * @returns The student data or null if not found
 */
export function getFormData(studentId: string | number): Record<string, any> | null {
  if (!studentId) return null;
  
  try {
    const studentsData = getFormsCollection();
    return studentsData[studentId] || null;
  } catch (error) {
    console.error('Error retrieving student data from localStorage:', error);
    return null;
  }
}

/**
 * Loads stored values into reactive refs for a student
 * @param studentId The ID of the student
 * @param refs Object containing reactive refs to update with keys matching storage keys
 * @param defaultValues Default values to use if stored values don't exist
 * @returns boolean indicating if data was successfully loaded
 */
export function loadFormDataToRefs(
  studentId: string | number,
  refs: Record<string, { value: any }>,
  defaultValues: Record<string, any> = {}
): boolean {
  if (!studentId) return false;
  
  try {
    const studentData = getFormData(studentId);
    if (!studentData) return false;
    
    // Update each ref if the corresponding data exists
    Object.keys(refs).forEach(key => {
      if (key in studentData) {
        refs[key].value = studentData[key];
      } else if (key in defaultValues) {
        refs[key].value = defaultValues[key];
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error loading student data to refs:', error);
    return false;
  }
}

/**
 * Saves resources data to localStorage
 * @param resources The resources data to save, or a function to transform existing resources
 * @returns boolean indicating success or failure
 */
export function saveResources(
  resources: Record<string, any> | ((existing: Record<string, any>) => Record<string, any>)
): boolean {
  try {
    // If resources is a function, apply it to existing resources
    if (typeof resources === 'function') {
      const existingResources = getResources() || {};
      const newResources = resources(existingResources);
      localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify(newResources));
    } else {
      // Otherwise, just save the provided resources
      localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify(resources));
    }
    return true;
  } catch (error) {
    console.error('Error saving resources to localStorage:', error);
    return false;
  }
}

/**
 * Retrieves resources data from localStorage
 * @returns The resources data or null if not found
 */
export function getResources(): Record<string, any> | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RESOURCES);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error retrieving resources from localStorage:', error);
    return null;
  }
}

/**
 * Loads resources data from localStorage into reactive refs
 * @param refs Object containing reactive refs to update with keys matching resource IDs
 * @returns boolean indicating if data was successfully loaded
 */
export function loadResourcesToRefs(
  refs: Record<string, { value: any }>
): boolean {
  try {
    const resources = getResources();
    if (!resources) return false;
    
    Object.entries(resources).forEach(([id, resource]) => {
      if (id in refs) {
        refs[id].value = resource.QuantityOwned || 0;
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error loading resources data to refs:', error);
    return false;
  }
}

/**
 * Saves resources data from student materials
 * @param student The student object containing materials
 * @param resourceFormData The form data with updated quantities
 * @returns boolean indicating success or failure
 */
export function saveResourcesFromStudent(
  student: { Materials?: Record<string, any> }, 
  resourceFormData: { value: Record<string, number> }
): boolean {
  try {
    if (!student?.Materials) return false;
    
    const resourceData = Object.values(student.Materials).reduce((acc, material: any) => {
      acc[material.Id] = {
        ...material,
        QuantityOwned: resourceFormData.value[material.Id] || 0
      };
      return acc;
    }, {} as Record<string, any>);
    
    return saveResources(resourceData);
  } catch (error) {
    console.error('Error processing and saving resources to localStorage:', error);
    return false;
  }
}