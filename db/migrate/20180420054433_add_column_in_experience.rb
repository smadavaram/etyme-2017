class AddColumnInExperience < ActiveRecord::Migration[4.2][5.1]
  def change

    remove_column :candidates, :industry, :string
    remove_column :candidates, :department, :string

    add_column :experiences, :industry, :string
    add_column :experiences, :department, :string

  end
end
