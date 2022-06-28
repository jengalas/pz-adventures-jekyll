// Accordion/Collapsible Content: https://www.elated.com/res/File/articles/development/javascript/document-object-model/javascript-accordion/javascript-accordion.html

var accordionItems = new Array();

      // Grab the accordion items from the page
      var divs = document.getElementsByTagName( 'div' );
      for ( var i = 0; i < divs.length; i++ ) {
        if ( divs[i].className == 'accordionItem' ) accordionItems.push( divs[i] );
      }

      // Assign onclick events to the accordion item headings
      for ( var i = 0; i < accordionItems.length; i++ ) {
        var h3 = getFirstChildWithTagName( accordionItems[i], 'H3' );
        h3.onclick = toggleItem;
      }

      // Hide all accordion item bodies except the first
      for ( var i = 0; i < accordionItems.length; i++ ) {
        accordionItems[i].className = 'accordionItem hide';
      }
    

    function toggleItem() {
      var itemClass = this.parentNode.className;

      // Hide all items
      for ( var i = 0; i < accordionItems.length; i++ ) {
        accordionItems[i].className = 'accordionItem hide';
      }

      // Show this item if it was previously hidden
      if ( itemClass == 'accordionItem hide' ) {
        this.parentNode.className = 'accordionItem';
      }
    }

    function getFirstChildWithTagName( element, tagName ) {
      for ( var i = 0; i < element.childNodes.length; i++ ) {
        if ( element.childNodes[i].nodeName == tagName ) return element.childNodes[i];
      }
    }

let navButton = document.querySelector(".nav-button");

navButton.addEventListener("click", (e) => { 
  e.preventDefault();
  
  // toggle nav state
  document.body.classList.toggle("nav-visible");
});

/* Dropdown accordion in menu overlay */
var list = document.querySelectorAll('.list');
function accordion(e) {
  e.stopPropagation();
  if (this.classList.contains('active')) {
      this.classList.remove('active');
  } else
  if (this.parentElement.parentElement.classList.contains('active')) {
      this.classList.add('active');
  } else
  {
      for (i = 0; i < list.length; i++) {
          list[i].classList.remove('active');
      }
      this.classList.add('active');
  }
}
for (i = 0; i < list.length; i++) {
  list[i].addEventListener('click', accordion);
}