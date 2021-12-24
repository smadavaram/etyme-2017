# frozen_string_literal: true

# == Schema Information
#
# Table name: conversation_mutes
#
#  id              :bigint           not null, primary key
#  conversation_id :bigint
#  mutable_type    :string
#  mutable_id      :bigint
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class ConversationMute < ApplicationRecord
  belongs_to :conversation
  belongs_to :mutable, polymorphic: true

  validates_uniqueness_of :conversation_id, scope: :mutable
end
