import { ref, computed } from 'vue'
import { StudentProps } from '../../types/student';
import { BoxDataProps, GiftDataProps } from '../../types/gift';
import { saveResources, saveStudentData, getResources } from '../utils/studentStorage';
import { ResourceProps } from '../../types/resource';

// Constants
const GENERIC_GIFT_TAGS = ["BC", "Bc", "ew", "DW"];
const GIFT_BOX_IDS = ['82', '100000', '100008', '100009'];
const GIFT_BOX_EXP_VALUES = {
  'SR': 20,
  'SSR': 120
};
const MATERIAL = {
  'category': "CharacterExpGrowth",
  'subcategory': ["Artifact", "CDItem", "BookItem"],
  'id': ['5', '2000', '2001', '2002', '9999']
}

// Define sort options
export type SortOption = 'id' | 'name' | 'default';
export type SortDirection = 'asc' | 'desc';

export function useStudentData() {
  const studentData = ref<{ [key: string]: StudentProps }>({});
  const giftData = ref<Record<string, any>>({});
  const boxData = ref<Record<string, any>>({});
  const materialData = ref<Record<string, any>>({});
  const favoredGift = ref<Record<string, any[]>>({});
  const giftBoxData = ref<Record<string, any[]>>({});
  const searchQuery = ref<string>('');
  const isDarkMode = ref<boolean>(false);
  const currentSort = ref<SortOption>('id');
  const sortDirection = ref<SortDirection>('asc');
  
  // Store the sorted students array directly
  const sortedStudentsArray = ref<StudentProps[]>([]);

  // Function to update the sorted students array
  function updateSortedStudents() {
    // First filter by search query
    let filteredStudents = Object.values(studentData.value);
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      filteredStudents = filteredStudents.filter(
        (student: StudentProps) => student.Name.toLowerCase().includes(query)
      );
    }
    
    // Then sort according to the selected sort option
    filteredStudents.sort((a, b) => {
      let comparison = 0;
      switch (currentSort.value) {
        case 'name':
          comparison = a.Name.localeCompare(b.Name);
          break;
        case 'default':
          comparison = (a.DefaultOrder || 0) - (b.DefaultOrder || 0);
          break;
        case 'id':
        default:
          comparison = Number(a.Id) - Number(b.Id);
          break;
      }
      
      // Apply sort direction
      return sortDirection.value === 'asc' ? comparison : -comparison;
    });
    
    // Create completely new array to ensure reactivity
    sortedStudentsArray.value = [...filteredStudents];
  }
  
  // For backward compatibility with code expecting an object
  const filteredStudents = computed<Record<string, StudentProps>>(() => {
    return Object.fromEntries(sortedStudentsArray.value.map(student => [student.Id, student]));
  });
  
  // Load saved sort preferences
  function loadSortPreferences() {
    const savedSort = localStorage.getItem('sort-option') as SortOption;
    const savedDirection = localStorage.getItem('sort-direction') as SortDirection;
    
    if (savedSort && ['id', 'name', 'default'].includes(savedSort)) {
      currentSort.value = savedSort;
    }
    
    if (savedDirection && ['asc', 'desc'].includes(savedDirection)) {
      sortDirection.value = savedDirection;
    }
  }

  // Save sort preferences
  function saveSortPreferences() {
    localStorage.setItem('sort-option', currentSort.value);
    localStorage.setItem('sort-direction', sortDirection.value);
  }

  // Change the sort option
  function setSortOption(option: SortOption) {
    // If the same option is selected, toggle the direction
    if (currentSort.value === option) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      // If a new option is selected, reset to ascending
      currentSort.value = option;
      sortDirection.value = 'asc';
    }
    
    // Save preferences
    saveSortPreferences();
    
    // Update the sorted array
    updateSortedStudents();
  }
  
  // Toggle sort direction explicitly
  function toggleDirection() {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    saveSortPreferences();
    updateSortedStudents();
  }

  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
    const theme = isDarkMode.value ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
  
  // Update search query
  function updateSearchQuery(query: string) {
    searchQuery.value = query;
    updateSortedStudents();
  }

  async function fetchData(type: string) {
    try {
      const url = `https://schaledb.com/data/en/${type}.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data from ${url}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching ${type} data:`, error);
      return {};
    }
  }

  // Utility functions
  function filterByProperty(
    items: Record<string, any>, type: string, value: string | string[]) {
    const filteredItems = {};
    let valueArray: (string | number)[] = Array.isArray(value) ? value : [value];
    
    if (type === 'id') {
      valueArray = valueArray.map(val => Number(val));
    }
    
    for (const itemId in items) {
      if (isItemMatch(items[itemId], type, valueArray)) {
        filteredItems[itemId] = items[itemId];
      }
    }
    
    return filteredItems;
  }

  function isItemMatch(
    item: any, type: string, valueArray: (string | number)[]): boolean {
    switch (type) {
      case 'category':
        return valueArray.includes(item.Category);
      case 'subcategory':
        return valueArray.includes(item.SubCategory);
      case 'id':
        return valueArray.includes(item.Id);
      default:
        return false;
    }
  }

  function mergeFilteredItems(...objects: Record<string, any>[]) {
    const result: Record<string, any> = {};
    
    for (const obj of objects) {
      for (const key in obj) {
        result[key] = obj[key];
      }
    }
    
    return result;
  }

  function applyFilters(
    items: Record<string, any>, filterObj: Record<string, any>) {
    const results: Record<string, any>[] = [];
    
    for (const [type, value] of Object.entries(filterObj)) {
      if (value) { 
        const filtered = filterByProperty(items, type, value);
        results.push(filtered);
      }
    }
    
    return mergeFilteredItems(...results);
  }

  function getGiftsByStudent(
    students: Record<string, StudentProps>, 
    items: Record<string, any>, 
    isGiftBox: boolean): Record<string, (GiftDataProps | BoxDataProps)[]> {
    const result: Record<string, (GiftDataProps | BoxDataProps)[]> = {};
    
    for (const studentId in students) {
      const student = students[studentId];
      const allTags = getAllStudentTags(student);
      const studentGifts = isGiftBox 
        ? processGiftBoxItems(studentId, items, allTags)
        : processRegularGiftItems(items, allTags);
      
      result[studentId] = studentGifts;
    }
    
    return result;
  }
  
  function getAllStudentTags(student: StudentProps) {
    const uniqueGiftTags = student.FavorItemUniqueTags;
    const rareGiftTags = student.FavorItemTags;
    return [...uniqueGiftTags, ...rareGiftTags, ...GENERIC_GIFT_TAGS];
  }
  
  function processRegularGiftItems(
    items: Record<string, any>, allTags: string[]) {
    const studentGifts: (GiftDataProps | BoxDataProps)[] = [];
    
    for (const itemId in items) {
      const item = items[itemId];
      const giftDetails = evaluateRegularGift(item, allTags);
      
      if (giftDetails.shouldGift) {
        studentGifts.push({
          gift: item,
          exp: giftDetails.expValue,
          grade: giftDetails.favorGrade + 1,
        });
      }
    }
    
    return studentGifts;
  }
  
  function evaluateRegularGift(item: any, allTags: string[]) {
    const commonTags = item.Tags.filter((tag: string) => allTags.includes(tag));
    const favorGrade = Math.min(commonTags.length, 3);
    const genericTagCount = countGenericTags(item);
    const expValue = calculateGiftExp(item, commonTags);
    
    const shouldGift = (favorGrade - genericTagCount > 0) ||
                        (favorGrade >= 2 && item.Tags.length <= 3);
    
    return { shouldGift, expValue, favorGrade };
  }
  
  function processGiftBoxItems(
    studentId: string, items: Record<string, any>, allTags: string[]) {
    const studentGifts: (GiftDataProps | BoxDataProps)[] = [];
    const { 
      highestExpGift, 
      highestGradeGift, 
      isCollabStudent 
    } = getStudentGiftBoxInfo(studentId);
    
    for (const itemId in items) {
      const item = items[itemId];
      const giftDetails = evaluateGiftBoxItem(
        item, 
        allTags, 
        highestExpGift, 
        highestGradeGift, 
        isCollabStudent
      );
      
      if (giftDetails.shouldGift) {
        studentGifts.push({
          gift: item,
          exp: giftDetails.expValue,
          grade: giftDetails.newFavorGrade,
        });
      }
    }
    
    return studentGifts;
  }
  
  function getStudentGiftBoxInfo(studentId) {
    let highestExpGift = 0;
    let highestGradeGift = 0;
    let isCollabStudent = false;
    
    const studentFavoredGifts = favoredGift.value[studentId] || [];
    if (studentFavoredGifts.length === 4) {
      isCollabStudent = true;
    }
    
    studentFavoredGifts.forEach((gift) => {
      if (gift.gift.Rarity === "SR" && gift.exp > highestExpGift) {
        highestExpGift = gift.exp;
        highestGradeGift = gift.grade;
      }
    });
    
    return { highestExpGift, highestGradeGift, isCollabStudent };
  }
  
  function evaluateGiftBoxItem(
    item: any, allTags: string[], highestExpGift: number, 
    highestGradeGift: number, isCollabStudent: boolean) {
    const commonTags = item.Tags.filter((tag: string) => allTags.includes(tag));
    const favorGrade = Math.min(commonTags.length, 3);
    const genericTagCount = countGenericTags(item);
    const shouldGift = (favorGrade + genericTagCount >= 0);
    
    let expValue = 0;
    let newFavorGrade = 0;
    
    if (item.Category === 'Consumable') {
      expValue = GIFT_BOX_EXP_VALUES[item.Rarity];
      newFavorGrade = favorGrade + genericTagCount + item.Quality - 2;
      
      if (item.Tags.includes('DW')) {
        expValue = highestExpGift || 20;
        newFavorGrade = highestGradeGift;
      }
      
      if (isCollabStudent) {
        newFavorGrade = item.Rarity === "SR" ? 1 : 2;
      }
    }
    
    return { shouldGift, expValue, newFavorGrade };
  }
  
  function countGenericTags(item: any) {
    return item.Tags.filter((tag: string) => GENERIC_GIFT_TAGS.includes(tag)).length;
  }
  
  function calculateGiftExp(item: any, tags: string[]) {
    return item.ExpValue * (1 + Math.min(tags.length, 3));
  }

  // Usage in initialization
  async function initializeData() {
    // Load sort preferences first
    loadSortPreferences();
    
    studentData.value = await fetchData('students');
    const allItems = await fetchData('items');
    giftData.value = filterByProperty(allItems, 'category', 'Favor');
    boxData.value = filterByProperty(allItems, 'id', GIFT_BOX_IDS);
    
    // Use the new combined function
    favoredGift.value = getGiftsByStudent(studentData.value, giftData.value, false);
    giftBoxData.value = getGiftsByStudent(studentData.value, boxData.value, true);
    
    // Save the combined data to localStorage as initial data
    saveStudentData(studentData.value, favoredGift.value, giftBoxData.value);
    
    // Handle resources initialization and credits
    const existingResources = getResources();

    // Define credits object
    const creditsEntry = {
      Id: 5,
      Name: 'Credits',
      Icon: 'currency_icon_gold',
      Description: 'In-game currency used for various upgrades',
      QuantityOwned: 0
    };

    if (!existingResources) {
      // If no resources exist, save all items including credits
      allItems[5] = creditsEntry;
      saveResources(allItems);
    } else if (!existingResources[5]) {
      // If resources exist but don't include credits, add just the credits
      existingResources[5] = creditsEntry;
      saveResources(existingResources);
    }

    materialData.value = existingResources || applyFilters(allItems, MATERIAL);
    
    // Initialize the sorted students array
    updateSortedStudents();
  }

  initializeData()

  return {
    studentData,
    giftData,
    boxData,
    materialData,
    favoredGift,
    giftBoxData,
    searchQuery,
    isDarkMode,
    filteredStudents,
    sortedStudentsArray,
    toggleTheme,
    setSortOption,
    currentSort,
    sortDirection,
    updateSearchQuery,
    toggleDirection
  }
}