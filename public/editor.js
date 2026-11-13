import { el, toast } from './common.js';

/**
 * The form for an exchange's details, people, and couples. Used to create an
 * exchange and to edit it. Once names are drawn, people and couples are locked.
 */
export function createEditor(root, { exchange = {}, participants = [], couples = [], rosterLocked = false } = {}) {
  let people = participants.map(({ id, name }) => ({ id, name }));
  let pairs = couples.map(([a, b]) => [a, b]);
  let justAdded = new Set();

  const field = (label, input, optional = false) =>
    el('label', {}, label, optional && el('span', { class: 'optional' }, ' (optional)'), input);

  const nameInput = el('input', { maxlength: 60, placeholder: 'Family Gift Swap 2026', value: exchange.name ?? '' });
  const budgetInput = el('input', { maxlength: 30, placeholder: '$30', value: exchange.budget ?? '' });
  const dateInput = el('input', { type: 'date', value: exchange.date ?? '' });
  const noteInput = el('textarea', { maxlength: 500, rows: 3, placeholder: "We'll swap gifts at Grandma's after dinner. Ugly sweaters encouraged!" });
  noteInput.value = exchange.note ?? '';

  root.append(el('section', { class: 'card' },
    el('h2', {}, 'The exchange 🎄'),
    field('Name your exchange', nameInput),
    el('div', { class: 'row' },
      field('Gift budget', budgetInput, true),
      field('Exchange day', dateInput, true),
    ),
    field('A note for everyone', noteInput, true),
  ));

  const read = () => ({
    name: nameInput.value,
    budget: budgetInput.value,
    date: dateInput.value,
    note: noteInput.value,
    ...(rosterLocked ? {} : { participants: people, couples: pairs }),
  });

  if (rosterLocked) return { read };

  const newName = el('input', { maxlength: 40, placeholder: 'Type a name, or paste a list', 'aria-label': 'Name to add' });
  const chips = el('ul', { class: 'chips', 'aria-label': 'People in the exchange' });
  const count = el('p', { class: 'count' });

  const addNames = (raw) => {
    const names = raw.split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      if (name.length > 40) {
        toast(`"${name.slice(0, 20)}…" is too long for a gift tag.`, { error: true });
      } else if (people.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
        toast(`${name} is already on the list. Add a last initial to tell them apart.`, { error: true });
      } else {
        people.push({ name });
        justAdded.add(name);
      }
    }
    newName.value = '';
    render();
  };

  const removePerson = (name) => {
    people = people.filter((person) => person.name !== name);
    pairs = pairs.filter((pair) => !pair.includes(name));
    render();
  };

  newName.addEventListener('paste', (event) => {
    const pasted = event.clipboardData.getData('text');
    if (/[\n,;]/.test(pasted)) {
      event.preventDefault();
      const { value, selectionStart, selectionEnd } = newName;
      addNames([value.slice(0, selectionStart), pasted, value.slice(selectionEnd)].join('\n'));
    }
  });

  root.append(el('section', { class: 'card' },
    el('h2', {}, "Who's in? 🧑‍🎄"),
    el('p', { class: 'hint' }, 'Everyone gets their own secret link. You need at least 3 people.'),
    el('form', { class: 'inline', onsubmit: (event) => { event.preventDefault(); addNames(newName.value); newName.focus(); } },
      newName,
      el('button', { class: 'btn gold', type: 'submit' }, 'Add'),
    ),
    chips,
    count,
  ));

  const pickA = el('select', { 'aria-label': 'First partner' });
  const pickB = el('select', { 'aria-label': 'Second partner' });
  const pairList = el('ul', { class: 'pairs' });

  const pairUp = () => {
    const [a, b] = [pickA.value, pickB.value];
    if (!a || !b) return toast('Pick two people to pair up.', { error: true });
    if (a === b) return toast("Nice try, but you can't be your own partner.", { error: true });
    pairs.push([a, b]);
    render();
  };

  root.append(el('section', { class: 'card' },
    el('h2', {}, 'Couples 💞'),
    el('p', { class: 'hint' }, "Partners already get each other a gift, so they'll never draw each other."),
    el('div', { class: 'inline wrap' },
      pickA,
      el('span', { class: 'amp', 'aria-hidden': 'true' }, '&'),
      pickB,
      el('button', { class: 'btn gold', type: 'button', onclick: pairUp }, 'Pair up'),
    ),
    pairList,
  ));

  function render() {
    chips.replaceChildren(...people.map(({ name }) =>
      el('li', { class: justAdded.has(name) ? 'chip new' : 'chip' },
        name,
        el('button', { type: 'button', 'aria-label': `Remove ${name}`, onclick: () => removePerson(name) }, '✕'),
      ),
    ));
    justAdded = new Set();
    count.textContent = people.length
      ? `${people.length} ${people.length === 1 ? 'person' : 'people'} on the nice list`
      : 'Nobody yet. Add your first elf!';

    const paired = new Set(pairs.flat());
    const options = people.filter(({ name }) => !paired.has(name));
    for (const select of [pickA, pickB]) {
      const previous = select.value;
      select.replaceChildren(
        el('option', { value: '' }, 'Choose…'),
        ...options.map(({ name }) => el('option', { value: name, selected: name === previous }, name)),
      );
    }

    pairList.replaceChildren(...pairs.map(([a, b]) =>
      el('li', {},
        `${a} 💕 ${b}`,
        el('button', {
          class: 'btn ghost small',
          type: 'button',
          onclick: () => { pairs = pairs.filter((pair) => pair[0] !== a); render(); },
        }, 'Unpair'),
      ),
    ));
  }

  render();
  return { read };
}
