# frozen_string_literal: true

# == Schema Information
#
# Table name: messages
#
#  id               :integer          not null, primary key
#  body             :string
#  chat_id          :integer
#  messageable_type :string
#  messageable_id   :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  company_doc_id   :integer
#  file_status      :integer          default("pending")
#
class Message < ApplicationRecord
  enum file_status: %i[pending signed_uploaded]
  belongs_to :messageable, polymorphic: true, optional: true
  belongs_to :chat, optional: true
  belongs_to :company_doc, optional: true
  after_create :trigger_pusher

  validates :body, presence: :true

  def timeout_and_retry
    retries = 0
    begin
      Timeout.timeout(10) { yield }
    rescue Timeout::Error
      raise if (self.retries += 1) > 3

      retry
    end
  end

  def trigger_pusher
    timeout_and_retry do
      Pusher.trigger(chat.channel_name, 'send-message', message: id)
    rescue Pusher::Error => e
    end
  end
end
