class ChatUser < ActiveRecord::Base
  belongs_to :userable      , polymorphic: true
  belongs_to :chat
  after_create :send_message
  validates_uniqueness_of :chat_id ,scope: [:userable_id,:userable_type]

  private

  def send_message
    self.userable.messages.create(chat_id: self.chat_id,body: "User #{self.userable.full_name} joined the conversation.")
  end
end
