class Chat < ActiveRecord::Base
  has_many   :messages      ,dependent: :destroy
  has_many   :chat_users    ,dependent: :destroy
  belongs_to :chatable      ,polymorphic: :true

  attr_accessor :user_ids

  def channel_name
    "message-"+self.id.to_s
  end

  # validates :chat_id ,uniqueness: {scope: [:chatable_id, :chatable_type] }
end
