class AddAcceptedByCompanyToInterviews < ActiveRecord::Migration[5.1]
  def change
    add_column :interviews, :accepted_by_company, :boolean, default: false
  end
end
