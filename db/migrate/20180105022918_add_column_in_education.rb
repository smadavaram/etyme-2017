class AddColumnInEducation < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :educations, :degree_level, :string
  end
end