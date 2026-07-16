"use client";

import React from "react";
import styles from "./ArgsInput.module.css";

function createDefaultArgValue(input) {
  if (!input) return "";
  if (input.type === "tuple" && input.components) {
    return input.components.map((component) =>
      createDefaultArgValue(component),
    );
  }
  if (/^tuple\[(\d*)\]$/.test(input.type) && input.components) {
    return [];
  }
  return "";
}

function createDefaultTupleValue(input) {
  return (input.components || []).map((component) =>
    createDefaultArgValue(component),
  );
}

function toTupleValues(value, input) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return (input.components || []).map((component) =>
      component.name ? value[component.name] : undefined,
    );
  }
  return createDefaultTupleValue(input);
}

function getTupleArrayLength(type) {
  const match = type.match(/^tuple\[(\d*)\]$/);
  if (!match || match[1] === "") return null;
  return Number(match[1]);
}

function toTupleArrayValues(value, input) {
  const values = Array.isArray(value) ? value : [];
  const fixedLength = getTupleArrayLength(input.type);
  if (fixedLength === null) return values;
  return Array.from({ length: fixedLength }, (_, index) =>
    values[index] !== undefined
      ? values[index]
      : createDefaultTupleValue(input),
  );
}

function PrimitiveArgInput({
  input,
  value,
  onChange,
  error,
  ArgInputComponent,
  addressBook,
  disabled,
  onOpenBookmarkModal,
}) {
  if (ArgInputComponent) {
    return React.createElement(ArgInputComponent, {
      input,
      value,
      onChange,
      addressBook,
      disabled,
      onBookmarkClick: onOpenBookmarkModal,
      error,
    });
  }

  return React.createElement("input", {
    type: "text",
    value: value || "",
    onChange: (event) => onChange(event.target.value),
    placeholder: `Enter ${input.type}...`,
    className: styles.input + (error ? " " + styles.inputError : ""),
    disabled,
  });
}

function getArrayLength(type) {
  const match = type.match(/\[(\d*)\]$/);
  if (!match || match[1] === "") return null;
  return Number(match[1]);
}

function PrimitiveArrayInput(props) {
  const {
    input,
    value,
    onChange,
    error,
    disabled,
    ArgInputComponent,
    addressBook,
    onOpenBookmarkModal,
  } = props;
  const items = Array.isArray(value) ? value : [];
  const fixedLength = getArrayLength(input.type);
  const baseInput = { ...input, type: input.type.replace(/\[\d*\]$/, "") };

  return React.createElement(
    "div",
    {
      className:
        styles.tupleArrayGroup + (error ? " " + styles.tupleGroupError : ""),
    },
    ...items.map((item, index) =>
      React.createElement(
        "div",
        { key: index, className: styles.tupleArrayItem },
        React.createElement(
          "div",
          { className: styles.tupleArrayItemHeader },
          React.createElement(
            "span",
            { className: styles.tupleArrayIndex },
            `#${index}`,
          ),
          fixedLength === null
            ? React.createElement(
                "button",
                {
                  type: "button",
                  className: styles.tupleButton,
                  onClick: () => onChange(items.filter((_, i) => i !== index)),
                  disabled,
                },
                "Remove",
              )
            : null,
        ),
        React.createElement(PrimitiveArgInput, {
          input: baseInput,
          value: item,
          onChange: (nextValue) => {
            const next = [...items];
            next[index] = nextValue;
            onChange(next);
          },
          error: null,
          ArgInputComponent,
          addressBook,
          disabled,
          onOpenBookmarkModal,
        }),
      ),
    ),
    fixedLength === null
      ? React.createElement(
          "button",
          {
            type: "button",
            className: styles.tupleButton,
            onClick: () => onChange([...items, ""]),
            disabled,
          },
          "Add item",
        )
      : null,
  );
}

function TupleInput(props) {
  const { input, value, onChange, error, title } = props;
  const tupleValues = toTupleValues(value, input);
  return React.createElement(
    "div",
    {
      className:
        styles.tupleGroup + (error ? " " + styles.tupleGroupError : ""),
    },
    title
      ? React.createElement("div", { className: styles.tupleTitle }, title)
      : null,
    ...(input.components || []).map((component, componentIndex) =>
      React.createElement(
        "div",
        { key: componentIndex, className: styles.tupleField },
        React.createElement(
          "label",
          { className: styles.tupleLabel },
          `${component.name || `arg${componentIndex}`} (${component.type})`,
        ),
        React.createElement(TupleArgInput, {
          ...props,
          input: component,
          value: tupleValues[componentIndex],
          onChange: (componentValue) => {
            const nextTuple = [...tupleValues];
            nextTuple[componentIndex] = componentValue;
            onChange(nextTuple);
          },
          error: null,
        }),
      ),
    ),
  );
}

function TupleArrayInput(props) {
  const { input, value, onChange, error, disabled } = props;
  const tupleValues = toTupleArrayValues(value, input);
  const fixedLength = getTupleArrayLength(input.type);
  return React.createElement(
    "div",
    {
      className:
        styles.tupleArrayGroup + (error ? " " + styles.tupleGroupError : ""),
    },
    ...tupleValues.map((tupleValue, tupleIndex) =>
      React.createElement(
        "div",
        { key: tupleIndex, className: styles.tupleArrayItem },
        React.createElement(
          "div",
          { className: styles.tupleArrayItemHeader },
          React.createElement(
            "span",
            { className: styles.tupleArrayIndex },
            `#${tupleIndex}`,
          ),
          fixedLength === null
            ? React.createElement(
                "button",
                {
                  type: "button",
                  className: styles.tupleButton,
                  onClick: () =>
                    onChange(
                      tupleValues.filter((_, index) => index !== tupleIndex),
                    ),
                  disabled,
                },
                "Remove",
              )
            : null,
        ),
        React.createElement(TupleInput, {
          ...props,
          input: { ...input, type: "tuple" },
          value: tupleValue,
          onChange: (nextTuple) => {
            const nextValues = [...tupleValues];
            nextValues[tupleIndex] = nextTuple;
            onChange(nextValues);
          },
          error: null,
        }),
      ),
    ),
    fixedLength === null
      ? React.createElement(
          "button",
          {
            type: "button",
            className: styles.tupleButton,
            onClick: () =>
              onChange([...tupleValues, createDefaultTupleValue(input)]),
            disabled,
          },
          "Add tuple",
        )
      : null,
  );
}

export default function TupleArgInput(props) {
  const { input } = props;
  if (input.type === "tuple" && input.components) {
    return React.createElement(TupleInput, props);
  }
  if (/^tuple\[(\d*)\]$/.test(input.type) && input.components) {
    return React.createElement(TupleArrayInput, props);
  }
  if (/\[\d*\]$/.test(input.type)) {
    return React.createElement(PrimitiveArrayInput, props);
  }
  return React.createElement(PrimitiveArgInput, props);
}
