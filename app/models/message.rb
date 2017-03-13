class Message < ActiveRecord::Base
  enum file_status: [:pending,:signed_uploaded]
  belongs_to :messageable, polymorphic: true
  belongs_to :chat
  belongs_to :company_doc
  after_create :trigger_pusher

  validates :body , presence:  :true

  def trigger_pusher
    Pusher.trigger(self.chat.channel_name, 'send-message', {message: self.id })
  end


end
