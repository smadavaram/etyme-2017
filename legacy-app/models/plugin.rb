# frozen_string_literal: true

# == Schema Information
#
# Table name: plugins
#
#  id            :bigint           not null, primary key
#  expires_at    :string
#  user_name     :string
#  access_token  :string
#  refresh_token :string
#  account_id    :string
#  account_name  :string
#  base_path     :string
#  plugin_type   :integer
#  company_id    :integer
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  app_key       :string
#  app_secret    :string
#
class Plugin < ApplicationRecord
  enum plugin_type: %i[docusign zoom skype]
  belongs_to :company
end
