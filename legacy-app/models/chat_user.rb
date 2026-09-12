# frozen_string_literal: true

# == Schema Information
#
# Table name: chat_users
#
#  id            :integer          not null, primary key
#  chat_id       :integer
#  status        :integer
#  userable_type :string
#  userable_id   :integer
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#
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
