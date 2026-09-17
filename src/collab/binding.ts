import * as Y from "yjs";
import {
  forActor,
  safeMemberName,
  favoriteKey,
  type PreferenceActor,
} from "../preferences";
import { projectReducer, type Action } from "../state";
import { generateId, type Favorite, type NamenymProject } from "../types";
import {
  DOMAIN_RESULTS,
  ENTITIES,
  FAVORITES,
  META,
  checkLayout,
  projectText,
  readProject,
  writeProject,
} from "./layout";

export class NamenymBinding {
  private listeners = new Set<() => void>();
  private snapshot: NamenymProject;
  private readOnly = false;
  private disposed = false;
  readonly undoManager: Y.UndoManager;
  constructor(
    readonly doc: Y.Doc,
    readonly actor: PreferenceActor,
    private isReadOnly: () => boolean = () => false
  ) {
    this.actor = { ...actor };
    checkLayout(doc);
    this.snapshot = forActor(readProject(doc), actor);
    this.undoManager = new Y.UndoManager(
      [
        doc.getMap(META),
        ...Object.values(ENTITIES).map((key) => doc.getMap(key)),
        doc.getMap(FAVORITES),
        doc.getMap("namenym:selectedStyles"),
        doc.getMap("namenym:selectedTlds"),
      ],
      { trackedOrigins: new Set([this]), captureTimeout: 0 }
    );
    doc.on("afterTransaction", this.changed);
  }
  private changed = () => {
    this.snapshot = forActor(readProject(this.doc), this.actor);
    for (const listener of this.listeners) listener();
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  updateActor(actor: PreferenceActor) {
    if (
      this.actor.id === actor.id &&
      this.actor.name === actor.name &&
      this.actor.scope === actor.scope
    )
      return;
    Object.assign(this.actor, actor);
    this.changed();
  }
  setReadOnly(value: boolean) {
    this.readOnly = value;
  }
  private writable() {
    if (this.readOnly || this.isReadOnly() || this.disposed)
      throw new Error("This naming project is read-only.");
    checkLayout(this.doc);
    if (this.doc.getMap(META).get("layoutVersion") !== 1)
      throw new Error("The shared project has not loaded.");
  }
  setFavorite(nameId: string, selected: boolean) {
    this.writable();
    if (!this.snapshot.mashups.some((n) => n.id === nameId))
      throw new Error("Unknown name.");
    const value: Favorite = {
      scope: this.actor.scope,
      memberId: this.actor.id,
      memberName: safeMemberName(this.actor.name),
      nameId,
    };
    const favorites = this.doc.getMap<Favorite>(FAVORITES),
      key = favoriteKey(value);
    this.doc.transact(() => {
      if (selected) favorites.set(key, value);
      else favorites.delete(key);
    }, this);
  }
  apply(action: Action) {
    this.writable();
    if (action.type === "LOAD_PROJECT")
      throw new Error("Use the host's explicit replacement flow.");
    if (action.type === "TOGGLE_SHORTLIST")
      return this.setFavorite(
        action.id,
        !this.snapshot.shortlisted.includes(action.id)
      );
    const before = readProject(this.doc);
    if (action.type === "DOMAIN_RESULT") {
      if (projectReducer(before, action) === before) return;
      const name = before.mashups.find((n) => n.id === action.id);
      if (
        !name ||
        name.label !== action.label ||
        name.inputRevision !== action.inputRevision ||
        name.revision !== action.revision
      )
        return;
      const result = {
        nameId: action.id,
        label: action.label,
        revision: action.revision,
        inputRevision: action.inputRevision,
        check: action.check,
      };
      this.doc.transact(
        () =>
          this.doc
            .getMap(DOMAIN_RESULTS)
            .set(
              JSON.stringify([
                action.id,
                action.inputRevision,
                action.check.checkedAt,
              ]),
              result
            ),
        this
      );
      return;
    }
    let next: NamenymProject;
    if (action.type === "REMOVE_CONCEPT") {
      // Retain words and provenance; projection moves orphans to Unassigned.
      next = {
        ...before,
        concepts: before.concepts.filter((c) => c.id !== action.id),
      };
    } else if (action.type === "RESTORE_THEME") {
      if (before.concepts.some((c) => c.id === action.theme.id)) return;
      next = { ...before, concepts: [...before.concepts, action.theme] };
    } else {
      next = projectReducer(before, action);
    }
    if (
      action.type === "EDIT_ITEM" &&
      action.kind === "mashups" &&
      next !== before
    ) {
      next = {
        ...next,
        mashups: next.mashups.map((n) =>
          n.id === action.id ? { ...n, inputRevision: generateId("input") } : n
        ),
      };
    }
    if (action.type === "SET_SUMMARY")
      next = { ...next, summarySourceFingerprint: before.brief };
    if (next === before) return;
    this.doc.transact(() => writeProject(this.doc, before, next), this);
  }
  text(field: string) {
    return projectText(this.doc, field);
  }
  editText(field: string, start: number, end: number, inserted: string) {
    this.writable();
    const text = this.text(field);
    if (start < 0 || end < start || end > text.length)
      throw new Error("Invalid text edit range.");
    this.doc.transact(() => {
      if (end > start) text.delete(start, end - start);
      if (inserted) text.insert(start, inserted);
      if (field === "summary")
        this.doc
          .getMap(META)
          .set("summarySourceFingerprint", this.snapshot.brief);
    }, this);
  }
  applyTextUpdate(update: Uint8Array, field: string) {
    this.writable();
    this.doc.transact(() => {
      Y.applyUpdate(this.doc, update);
      if (field === "summary")
        this.doc
          .getMap(META)
          .set("summarySourceFingerprint", this.snapshot.brief);
    }, this);
  }
  /** A toast may undo its action only while it is still the latest local edit. */
  captureUndo() {
    const item =
      this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
    const canUndo = () =>
      !!item &&
      this.undoManager.undoStack[this.undoManager.undoStack.length - 1] ===
        item;
    return {
      canUndo,
      undo: () => {
        if (canUndo()) this.undo();
      },
    };
  }

  undo() {
    this.writable();
    this.undoManager.undo();
  }
  redo() {
    this.writable();
    this.undoManager.redo();
  }
  destroy() {
    this.disposed = true;
    this.doc.off("afterTransaction", this.changed);
    this.undoManager.destroy();
    this.listeners.clear();
  }
}
