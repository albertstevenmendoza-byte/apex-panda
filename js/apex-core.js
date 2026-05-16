let x = 10;
let name = "Albert";
const pi = 3.12;

const MAX_VALUE = 100;

x = "now I'm a string";

function add(a, b) {
    return a + b;
}

const double = (x) => x * 2;

const result = add(3, 4);
const d = double(5);

if (x > 0) {
    console.log("positive");
} else if (x === 0) {
    console.log("zero");
} else {
    console.log("negative");
}

if (a > 0 && b > 0) {
    console.log("both positive");
}

const display = document.getElementById("display");

const btn = document.querySelector("#btn7");

display.textContent = "42"

function onClick() {
    console.log("Button pressed!");
}

const btn = document.querySelector("#myBtn")
btn.addEventListener("click", onClick)

btn.addEventListener("click", () => {
    console.log("Pressed!")
})

document.addEvenListener("keydown", onKey)