# frozen_string_literal: true

class GroupMsgNotify < ApplicationRecord
  belongs_to :group
  belongs_to :conversation_message
  belongs_to :member, polymorphic: true
end
