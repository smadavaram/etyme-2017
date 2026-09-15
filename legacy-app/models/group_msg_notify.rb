# frozen_string_literal: true

# == Schema Information
#
# Table name: group_msg_notifies
#
#  id                      :bigint           not null, primary key
#  group_id                :bigint
#  conversation_message_id :bigint
#  member_type             :string
#  member_id               :bigint
#  is_read                 :boolean          default(FALSE)
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#
class GroupMsgNotify < ApplicationRecord
  belongs_to :group
  belongs_to :conversation_message
  belongs_to :member, polymorphic: true
end
