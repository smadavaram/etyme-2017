class AddStatusInBench < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates_companies, :candidate_status, :integer, default: 0
  end
end
