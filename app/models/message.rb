class Message < ApplicationRecord
  enum file_status: [:pending,:signed_uploaded]
  belongs_to :messageable, polymorphic: true, optional: true
  belongs_to :chat, optional: true
  belongs_to :company_doc, optional: true
  after_create :trigger_pusher

  validates :body , presence:  :true

  def timeout_and_retry
    retries = 0
    begin
      Timeout::timeout(10) { yield }
    rescue Timeout::Error
      raise if (self.retries += 1) > 3
      retry
    end
  end

  def trigger_pusher
    timeout_and_retry do
      begin
        Pusher.trigger(self.chat.channel_name, 'send-message', {message: self.id })
      rescue Pusher::Error => e
      end
    end

  end


end
