package fixture.common;
class Common {
  void helper(Unrelated unrelated) {
    unrelated.send("ghost");
    unrelated.getForObject("http://ghost.invalid", String.class);
  }
}
