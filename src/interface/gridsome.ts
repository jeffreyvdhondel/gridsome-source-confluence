export interface Store {
  addCollection: (typeName: string) => Collection;
  addSchemaTypes: (schema: string) => void;
  createReference: (typeName: string, id: string) => NodeReference;
  getCollection: (typeName: string) => Collection;
}

export interface Collection {
  addNode: (node: any) => void;
  addReference: (field: string, typeName: string) => void;
  data: () => any[];
  updateNode: (node: any) => void;
}

interface NodeReference {
  id: string;
  typeName: string;
}

export interface Schema {
  addSchemaTypes: (schema: string | string[]) => void;
  schema: {
    createObjectType: (options: { name: string; fields: Record<string, string>; extensions?: Record<string, string | boolean>; interfaces?: string[] }) => void;
  };
}
