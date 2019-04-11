class AddFieldInJobAndCandidate < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :industry, :string
    add_column :jobs, :department, :string

    add_column :candidates, :industry, :string
    add_column :candidates, :department, :string
  end
end
