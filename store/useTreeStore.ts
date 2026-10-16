// store/useTreeStore.ts
import { create } from "zustand";
import { Person, Profile } from "@/types/database";

export interface ViewportCoordinates {
  x: number;
  y: number;
  zoom: number;
}

interface TreeState {
  people: Map<string, Person>;
  userProfile: Profile | null;
  selectedPersonId: string | null;
  focusedPersonId: string | null;
  collapsedBranchIds: Set<string>;

  // UI state
  viewport: ViewportCoordinates;
  isSidebarOpen: boolean;
  searchQuery: string;
  filterLivingOnly: boolean;
  filterGender: "all" | "male" | "female";

  // Actions
  setPeople: (peopleList: Person[]) => void;
  setUserProfile: (profile: Profile | null) => void;
  upsertPerson: (person: Person) => void;
  setSelectedPersonId: (id: string | null) => void;
  setFocusedPersonId: (id: string | null) => void;
  toggleBranchCollapse: (personId: string) => void;
  setViewport: (viewport: ViewportCoordinates) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setFilterLivingOnly: (value: boolean) => void;
  setFilterGender: (gender: "all" | "male" | "female") => void;
  resetFilters: () => void;
}

export const useTreeStore = create<TreeState>((set) => ({
  people: new Map(),
  userProfile: null,
  selectedPersonId: null,
  focusedPersonId: null,
  collapsedBranchIds: new Set(),

  viewport: { x: 0, y: 0, zoom: 1 },
  isSidebarOpen: false,
  searchQuery: "",
  filterLivingOnly: false,
  filterGender: "all",

  setPeople: (peopleList) =>
    set(() => {
      const map = new Map<string, Person>();
      peopleList.forEach((p) => map.set(p.id, p));
      return { people: map };
    }),

  setUserProfile: (profile) => set({ userProfile: profile }),

  upsertPerson: (person) =>
    set((state) => {
      const nextMap = new Map(state.people);
      nextMap.set(person.id, person);
      return { people: nextMap };
    }),

  setSelectedPersonId: (id) =>
    set({
      selectedPersonId: id,
      isSidebarOpen: id !== null,
    }),

  setFocusedPersonId: (id) => set({ focusedPersonId: id }),

  toggleBranchCollapse: (personId) =>
    set((state) => {
      const next = new Set(state.collapsedBranchIds);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return { collapsedBranchIds: next };
    }),

  setViewport: (viewport) => set({ viewport }),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilterLivingOnly: (filterLivingOnly) => set({ filterLivingOnly }),
  setFilterGender: (filterGender) => set({ filterGender }),

  resetFilters: () =>
    set({
      searchQuery: "",
      filterLivingOnly: false,
      filterGender: "all",
    }),
}));
