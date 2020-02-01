# frozen_string_literal: true

class ChatUser < ApplicationRecord
  belongs_to :userable, polymorphic: true, optional: true
  belongs_to :chat, optional: true
  after_create :send_message
  validates_uniqueness_of :chat_id, scope: %i[userable_id userable_type]

  private

  def send_message
    userable.messages.create(chat_id: chat_id, body: "User #{userable.full_name} joined the conversation.")
  end
end
