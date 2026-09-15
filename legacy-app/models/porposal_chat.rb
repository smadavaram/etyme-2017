# == Schema Information
#
# Table name: porposal_chats
#
#  id         :bigint           not null, primary key
#  company_id :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class PorposalChat < ApplicationRecord
    has_one :conversation
end
