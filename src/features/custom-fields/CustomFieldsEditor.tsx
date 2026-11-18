import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { fieldsFor, optionList, useCustomFields, type CustomField, type FieldEntity } from "./api";

interface Props {
  accountId: string;
  entity: FieldEntity;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  compact?: boolean;
}

// Renderiza os campos personalizados da entidade com o controle certo para cada tipo.
export function CustomFieldsEditor({
  accountId,
  entity,
  values,
  onChange,
  compact = false,
}: Props) {
  const { data } = useCustomFields(accountId);
  const fields = fieldsFor(data, entity);
  if (fields.length === 0) return null;
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-border bg-surface-2/40 p-4 sm:grid-cols-2">
      {!compact && <legend className="eyebrow px-1">Campos personalizados</legend>}
      {fields.map((f) => (
        <FieldInput key={f.id} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
    </fieldset>
  );
}

export function FieldInput({
  field: f,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `cf-${f.id}`;
  const label = (
    <Label htmlFor={id}>
      {f.label}
      {f.required && <span className="text-danger"> *</span>}
    </Label>
  );
  const str = value === undefined || value === null ? "" : String(value);
  const wide = f.type === "long_text" || f.type === "multiselect";
  let control: React.ReactNode;
  switch (f.type) {
    case "long_text":
      control = (
        <Textarea id={id} rows={3} value={str} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "number":
    case "money":
      control = (
        <Input
          id={id}
          inputMode="decimal"
          value={str}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            onChange(raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : value);
          }}
        />
      );
      break;
    case "date":
      control = (
        <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value || null)} />
      );
      break;
    case "boolean":
      control = (
        <div className="flex h-9 items-center">
          <Switch id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(c)} />
        </div>
      );
      break;
    case "select":
      control = (
        <Select value={str || "__none"} onValueChange={(v) => onChange(v === "__none" ? null : v)}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {optionList(f).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-3 pt-1">
          {optionList(f).map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-[13px]">
              <Checkbox
                checked={arr.includes(o)}
                onCheckedChange={(c) => onChange(c ? [...arr, o] : arr.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      control = (
        <Input
          id={id}
          type={f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "phone" ? "tel" : undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className={wide ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      {label}
      {control}
      {f.help && <p className="text-[11px] text-subtle">{f.help}</p>}
    </div>
  );
}
