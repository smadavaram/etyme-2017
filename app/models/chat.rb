class Chat < ActiveRecord::Base
  has_many   :messages      ,dependent: :destroy
  has_many   :chat_users    ,dependent: :destroy
  belongs_to :chatable      ,polymorphic: :true
end
