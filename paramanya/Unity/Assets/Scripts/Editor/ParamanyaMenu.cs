#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Paramanya.Board;
using Paramanya.Core;
using Paramanya.Data;

namespace Paramanya.EditorTools
{
    public static class ParamanyaMenu
    {
        private const string DataDir = "Assets/Paramanya/Data";

        /// <summary>Açık sahneye GameManager ekler ve Models klasöründeki FBX'leri otomatik bağlar.</summary>
        [MenuItem("Paramanya/Oyunu Sahneye Ekle")]
        public static void AddToScene()
        {
            var existing = Object.FindFirstObjectByType<GameManager>();
            if (existing != null) { Selection.activeObject = existing; return; }

            var go = new GameObject("Paramanya");
            var gm = go.AddComponent<GameManager>();

            var bm = new GameObject("Board").AddComponent<BoardManager>();
            bm.transform.SetParent(go.transform);
            bm.cityTilePrefab = Load("Tile_City");
            bm.cornerTilePrefab = Load("Tile_Corner");
            bm.cornerVariantPrefabs = new[]
            {
                Load("Tile_Corner_Start"), Load("Tile_Corner_Island"),
                Load("Tile_Corner_Festival"), Load("Tile_Corner_WorldTour")
            };
            bm.buildingPrefabs = new[]
            {
                Load("Building_Tier1_Villa"), Load("Building_Tier2_Apartment"),
                Load("Building_Tier3_Hotel"), Load("Building_Tier4_Landmark")
            };
            bm.pawnPrefab = Load("Pawn_Base");
            gm.boardManager = bm;

            var dc = new GameObject("Dice").AddComponent<DiceController>();
            dc.transform.SetParent(go.transform);
            dc.dicePrefab = Load("Dice");
            gm.diceController = dc;

            EditorSceneManager.MarkSceneDirty(go.scene);
            Selection.activeObject = go;
            Debug.Log("[Paramanya] GameManager eklendi. Play'e basın. FBX bulunamadıysa ilkel şekiller kullanılır.");
        }

        private static GameObject Load(string name)
        {
            foreach (var guid in AssetDatabase.FindAssets(name + " t:Model"))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (Path.GetFileNameWithoutExtension(path) == name)
                    return AssetDatabase.LoadAssetAtPath<GameObject>(path);
            }
            return null;
        }

        /// <summary>Varsayılan 32 karelik tahtayı düzenlenebilir asset olarak kaydeder.</summary>
        [MenuItem("Paramanya/Varsayılan Tahtayı Asset Olarak Kaydet")]
        public static void SaveDefaultBoard()
        {
            Directory.CreateDirectory(DataDir);
            var temp = DefaultBoardFactory.Create();
            var board = ScriptableObject.CreateInstance<BoardData>();
            EditorUtility.CopySerialized(temp, board);
            AssetDatabase.CreateAsset(board, DataDir + "/BoardData.asset");

            for (int i = 0; i < BoardData.TileCount; i++)
            {
                var src = temp.tiles[i].city;
                if (src == null) continue;
                var city = ScriptableObject.CreateInstance<CityTileData>();
                EditorUtility.CopySerialized(src, city);
                AssetDatabase.CreateAsset(city, string.Format("{0}/City_{1:00}_{2}.asset", DataDir, i, Sanitize(src.displayName)));
                board.tiles[i].city = city;
            }
            EditorUtility.SetDirty(board);
            AssetDatabase.SaveAssets();
            Selection.activeObject = board;
            Debug.Log("[Paramanya] Tahta ve şehir asset'leri: " + DataDir + "  (GameManager > Board Data alanına sürükleyin)");
        }

        private static string Sanitize(string s)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
            return s.Replace(' ', '_');
        }
    }
}
#endif
