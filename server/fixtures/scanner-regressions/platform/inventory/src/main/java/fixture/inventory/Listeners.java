package fixture.inventory;
class Listeners {
  @org.springframework.kafka.annotation.KafkaListener(topics="orders") void kafka(String value) { }
  @org.springframework.amqp.rabbit.annotation.RabbitListener(queues="orders") void rabbit(String value) { }
}
