class AddTimestampToCandidatesCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates_companies, :created_at, :datetime,  default: Time.zone.now
    add_column :candidates_companies, :updated_at, :datetime,  default: Time.zone.now
  end
end
