$(document).ready(function() {
  let START_TIME = 2000;
  let ERASE_LETTER_TIME = 100;
  let WRITE_LETTER_TIME = 100;
  let $el = $("[data-scrolling-text]");

  if ($el.length !== 1) {
    return;
  }

  let texts = $el.data("scrolling-text").split(',');
  let currentIndex = 0;

  let eraseWord = function() {
    if ($el.text() !== "") {
      $el.text($el.text().slice(0, $el.text().length - 1));
      setTimeout(eraseWord, ERASE_LETTER_TIME);
    } else {
      currentIndex = (currentIndex + 1) % texts.length;
      setTimeout(writeWord, WRITE_LETTER_TIME);
    }
  }

  let writeWord = function() {
    if ($el.text() !== texts[currentIndex]) {
      $el.text(texts[currentIndex].slice(0, $el.text().length + 1));
      setTimeout(writeWord, WRITE_LETTER_TIME);
    } else {
      setTimeout(function() {
        setTimeout(eraseWord, ERASE_LETTER_TIME)
      }, START_TIME);
    }
  }

  writeWord();
})
