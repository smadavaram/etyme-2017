class AddStatusToCandidatesCompany < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates_companies ,:status ,:integer ,default: 0
  end
end
