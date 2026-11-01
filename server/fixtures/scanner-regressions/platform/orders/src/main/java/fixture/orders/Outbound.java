package fixture.orders;
class Outbound {
  @org.springframework.cloud.openfeign.FeignClient(
    name="inventory", url="${clients.inventory.url}") interface Inventory {}
  @org.springframework.cloud.openfeign.FeignClient(url="${missing.client.url}") interface Unresolved {}
  void calls(org.springframework.web.client.RestTemplate rest,
      org.springframework.web.reactive.function.client.WebClient.Builder web) {
    rest.getForObject("http://inventory.internal/items", String.class);
    web.baseUrl("http://inventory.internal/api").build().get();
    org.springframework.web.reactive.function.client.WebClient.create("http://inventory.internal").get();
  }
  @org.springframework.web.service.annotation.HttpExchange(url="http://inventory.internal/api") interface InventoryApi {}
  void webClientCreate() { org.springframework.web.reactive.function.client.WebClient.create("http://inventory.internal").get(); }
  void messages(org.springframework.kafka.core.KafkaTemplate<String,String> kafka,
      org.springframework.amqp.rabbit.core.RabbitTemplate rabbit, Unrelated unrelated) {
    kafka.send("orders", "payload");
    rabbit.convertAndSend("exchange", "orders", "payload");
    unrelated.send("not-a-kafka-topic");
  }
  @org.springframework.web.client.RestTemplateBuilder Fake fake;
  // rest.getForObject("http://commented.invalid", String.class);
  /* @org.springframework.boot.autoconfigure.SpringBootApplication class CommentedService {} */
}
