package example.orders;
class OrderClient {
  @org.springframework.cloud.openfeign.FeignClient(name="catalog", url="${catalog.url}") interface Catalog {}
  @org.springframework.web.service.annotation.HttpExchange(url="http://catalog/api") interface CatalogApi {}
  String get(org.springframework.web.client.RestTemplate rest) { return rest.getForObject("http://catalog/api", String.class); }
  void web(org.springframework.web.reactive.function.client.WebClient client) { client.get().uri("http://catalog/items"); }
  String example = "literal"; // rest.getForObject("http://fake.internal", String.class);
  void event(org.springframework.kafka.core.KafkaTemplate<String,String> kafka, org.springframework.amqp.rabbit.core.RabbitTemplate rabbit) {
    kafka.send("orders.created", "1");
    rabbit.convertAndSend("orders.exchange", "orders.created", "1");
  }
}
