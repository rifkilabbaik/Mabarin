import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

/** Menu Game: daftar game (meja & lapangan). Entri dengan `modes` menampilkan pilihan mode dulu. */
export class GameMenu {
  constructor({ ui, entries, isBusy }) {
    this.ui = ui;
    this.entries = entries;
    this.isBusy = isBusy;
  }

  open() {
    if (this.isBusy?.()) {
      this.ui.toast('Selesaikan game yang sedang dimainkan dulu.');
      return;
    }
    this.renderList();
    this.ui.openModal('games');
  }

  tile(e, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'game-tile';
    b.innerHTML = `<span class="gt-art">${icon(e.icon)}</span><span class="gt-text"><b></b><small>${icon('users')}<span></span></small></span>${icon('arrowRight')}`;
    b.querySelector('.gt-art').style.background = e.art;
    b.querySelector('b').textContent = e.name;
    b.querySelector('small span').textContent = e.players;
    b.addEventListener('click', onClick);
    return b;
  }

  renderList() {
    $('games-title').textContent = 'Game';
    $('games-list').replaceChildren(
      ...this.entries().map((e) =>
        this.tile(e, () => {
          if (e.modes) this.renderModes(e);
          else {
            this.ui.closeModal('games');
            e.start();
          }
        })
      )
    );
  }

  renderModes(e) {
    $('games-title').textContent = e.name;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn small';
    back.innerHTML = `${icon('arrowRight')}<span>Kembali</span>`;
    back.querySelector('.ic').style.transform = 'scaleX(-1)';
    back.addEventListener('click', () => this.renderList());
    $('games-list').replaceChildren(
      ...e.modes.map((m) =>
        this.tile({ ...e, name: m.name, players: m.players }, () => {
          this.ui.closeModal('games');
          e.start(m.id);
        })
      ),
      back
    );
  }
}
