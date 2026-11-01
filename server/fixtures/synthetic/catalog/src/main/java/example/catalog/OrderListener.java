package example.catalog;
class OrderListener {
  @org.springframework.kafka.annotation.KafkaListener(topics="orders.created") void receive(String value) { }
  @org.springframework.amqp.rabbit.annotation.RabbitListener(queues="orders.created") void receiveRabbit(String value) { }
}
